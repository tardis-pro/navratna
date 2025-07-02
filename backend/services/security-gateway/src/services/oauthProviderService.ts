import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { DatabaseService } from '@uaip/shared-services';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import axios, { AxiosResponse } from 'axios';
import {
  OAuthProviderConfig,
  OAuthProviderType,
  OAuthState,
  AgentOAuthConnection,
  UserType,
  AgentCapability,
  EnhancedUser,
  SecurityLevel,
  GitHubProviderConfig,
  EmailProviderConfig,
  AuditEventType
} from '@uaip/types';
import { AuditService } from './auditService.js';
import { config } from '@uaip/config';
import { randomBytes, createHash } from 'crypto';
import base64url from 'base64url';

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope?: string;
}

interface OAuthUserInfo {
  id: string;
  email?: string;
  name?: string;
  login?: string;
  avatar_url?: string;
  [key: string]: any;
}

interface ProviderEndpoints {
  authorization: string;
  token: string;
  userInfo: string;
  revoke?: string;
}

export interface AgentOperationValidation {
  allowed: boolean;
  reason?: string;
  rateLimit?: {
    remaining: number;
    resetTime: Date;
  };
}

export class OAuthProviderService {
  private providers: Map<string, OAuthProviderConfig> = new Map();
  private providerEndpoints: Map<OAuthProviderType, ProviderEndpoints> = new Map();

  constructor(
    private databaseService: DatabaseService,
    private auditService: AuditService
  ) {
    this.initializeProviderEndpoints();
    this.loadProviders();
  }

  /**
   * Initialize default provider endpoints
   */
  private initializeProviderEndpoints(): void {
    this.providerEndpoints.set(OAuthProviderType.GITHUB, {
      authorization: 'https://github.com/login/oauth/authorize',
      token: 'https://github.com/login/oauth/access_token',
      userInfo: 'https://api.github.com/user',
      revoke: 'https://api.github.com/applications/{client_id}/grant'
    });

    this.providerEndpoints.set(OAuthProviderType.GOOGLE, {
      authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      userInfo: 'https://www.googleapis.com/oauth2/v2/userinfo',
      revoke: 'https://oauth2.googleapis.com/revoke'
    });

    this.providerEndpoints.set(OAuthProviderType.GMAIL, {
      authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      userInfo: 'https://www.googleapis.com/oauth2/v2/userinfo',
      revoke: 'https://oauth2.googleapis.com/revoke'
    });

    this.providerEndpoints.set(OAuthProviderType.ZOHO, {
      authorization: 'https://accounts.zoho.com/oauth/v2/auth',
      token: 'https://accounts.zoho.com/oauth/v2/token',
      userInfo: 'https://accounts.zoho.com/oauth/user/info',
      revoke: 'https://accounts.zoho.com/oauth/v2/token/revoke'
    });

    this.providerEndpoints.set(OAuthProviderType.ZOHO_MAIL, {
      authorization: 'https://accounts.zoho.com/oauth/v2/auth',
      token: 'https://accounts.zoho.com/oauth/v2/token',
      userInfo: 'https://accounts.zoho.com/oauth/user/info',
      revoke: 'https://accounts.zoho.com/oauth/v2/token/revoke'
    });

    this.providerEndpoints.set(OAuthProviderType.MICROSOFT, {
      authorization: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userInfo: 'https://graph.microsoft.com/v1.0/me',
      revoke: 'https://login.microsoftonline.com/common/oauth2/v2.0/logout'
    });

    this.providerEndpoints.set(OAuthProviderType.OUTLOOK, {
      authorization: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userInfo: 'https://graph.microsoft.com/v1.0/me',
      revoke: 'https://login.microsoftonline.com/common/oauth2/v2.0/logout'
    });
  }

  /**
   * Load OAuth providers from database
   */
  private async loadProviders(): Promise<void> {
    try {
      const providers = await this.databaseService.getOAuthProviders();
      for (const provider of providers) {
        this.providers.set(provider.id, provider as any);
      }
      logger.info('OAuth providers loaded', { count: providers.length });
    } catch (error) {
      logger.error('Failed to load OAuth providers', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Create OAuth provider configuration
   */
  public async createProvider(config: OAuthProviderConfig): Promise<OAuthProviderConfig> {
    try {
      // Validate provider configuration
      await this.validateProviderConfig(config);

      // Encrypt sensitive data
      if (config.clientSecret) {
        config.clientSecret = await this.encryptSecret(config.clientSecret);
      }

      // Save to database
      const savedProvider = await this.databaseService.createOAuthProvider(config);
      this.providers.set(savedProvider.id, savedProvider as any);

      await this.auditService.logEvent({
        eventType: AuditEventType.SECURITY_CONFIG_CHANGE,
        details: {
          action: 'create_oauth_provider',
          providerId: savedProvider.id,
          providerType: savedProvider.type,
          agentAccess: savedProvider.agentConfig?.allowAgentAccess || false
        }
      });

      logger.info('OAuth provider created', {
        providerId: savedProvider.id,
        type: savedProvider.type,
        agentAccess: savedProvider.agentConfig?.allowAgentAccess || false
      });

      return savedProvider as any;
    } catch (error) {
      logger.error('Failed to create OAuth provider', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new ApiError(500, 'Failed to create OAuth provider', 'PROVIDER_CREATION_FAILED');
    }
  }

  /**
   * Generate OAuth authorization URL for agents and humans
   */
  public async generateAuthorizationUrl(
    providerId: string,
    redirectUri: string,
    userType: UserType = UserType.HUMAN,
    agentCapabilities?: AgentCapability[]
  ): Promise<{ url: string; state: string; codeVerifier?: string }> {
    try {
      const provider = this.providers.get(providerId);
      if (!provider || !provider.isEnabled) {
        throw new ApiError(404, 'OAuth provider not found or disabled', 'PROVIDER_NOT_FOUND');
      }

      // Check if user type is allowed
      if (!provider.securityConfig?.allowedUserTypes?.includes(userType)) {
        throw new ApiError(403, 'User type not allowed for this provider', 'USER_TYPE_NOT_ALLOWED');
      }

      // For agents, check capabilities and permissions
      if (userType === UserType.AGENT) {
        if (!provider.agentConfig?.allowAgentAccess) {
          throw new ApiError(403, 'Agent access not allowed for this provider', 'AGENT_ACCESS_DENIED');
        }

        if (agentCapabilities && provider.agentConfig?.requiredCapabilities) {
          const hasRequiredCapabilities = provider.agentConfig.requiredCapabilities.every(
            cap => agentCapabilities.includes(cap)
          );
          if (!hasRequiredCapabilities) {
            throw new ApiError(403, 'Agent lacks required capabilities', 'INSUFFICIENT_CAPABILITIES');
          }
        }
      }

      const endpoints = this.providerEndpoints.get(provider.type);
      if (!endpoints) {
        throw new ApiError(500, 'Provider endpoints not configured', 'ENDPOINTS_NOT_CONFIGURED');
      }

      // Generate secure state and PKCE parameters
      const state = this.generateSecureState();
      const codeVerifier = provider.securityConfig?.requirePKCE ? this.generateCodeVerifier() : undefined;
      const codeChallenge = codeVerifier ? this.generateCodeChallenge(codeVerifier) : undefined;

      // Store OAuth state with expiration
      const oauthState: OAuthState = {
        state,
        providerId,
        redirectUri,
        codeVerifier: provider.securityConfig?.requirePKCE ? codeVerifier : undefined,
        scope: provider.scope,
        userType,
        agentCapabilities,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      };

      await this.databaseService.saveOAuthState(oauthState);

      // Build authorization URL with proper parameters
      const params = new URLSearchParams({
        client_id: provider.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: provider.scope.join(' '),
        state,
        ...(provider.securityConfig?.requirePKCE && {
          code_challenge: codeChallenge,
          code_challenge_method: 'S256'
        }),
        ...provider.additionalParams
      });

      const authUrl = `${endpoints.authorization}?${params.toString()}`;

      logger.info('OAuth authorization URL generated', {
        providerId,
        providerType: provider.type,
        userType,
        agentCapabilities: agentCapabilities?.length || 0
      });

      return { url: authUrl, state, codeVerifier };
    } catch (error) {
      logger.error('Failed to generate authorization URL', {
        providerId,
        userType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  public async handleCallback(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<{
    tokens: OAuthTokenResponse;
    userInfo: OAuthUserInfo;
    provider: OAuthProviderConfig;
    oauthState: OAuthState;
  }> {
    try {
      // Retrieve and validate state
      const oauthState = await this.databaseService.getOAuthState(state);
      if (!oauthState || oauthState.expiresAt < new Date()) {
        throw new ApiError(400, 'Invalid or expired OAuth state', 'INVALID_STATE');
      }

      const provider = this.providers.get(oauthState.providerId);
      if (!provider) {
        throw new ApiError(404, 'OAuth provider not found', 'PROVIDER_NOT_FOUND');
      }

      const endpoints = this.providerEndpoints.get(provider.type);
      if (!endpoints) {
        throw new ApiError(500, 'Provider endpoints not configured', 'ENDPOINTS_NOT_CONFIGURED');
      }

      // Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(
        provider,
        endpoints,
        code,
        redirectUri,
        oauthState.codeVerifier
      );

      // Get user info from provider
      const userInfo = await this.getUserInfo(provider.type, tokens.access_token);

      // Clean up OAuth state
      await this.databaseService.deleteOAuthState(state);

      // Audit successful OAuth callback
      await this.auditService.logEvent({
        eventType: AuditEventType.LOGIN_SUCCESS,
        details: {
          provider: provider.type,
          userType: oauthState.userType,
          agentCapabilities: oauthState.agentCapabilities,
          userInfo: {
            id: userInfo.id,
            email: userInfo.email,
            name: userInfo.name || userInfo.login
          }
        }
      });

      logger.info('OAuth callback handled successfully', {
        providerId: provider.id,
        providerType: provider.type,
        userType: oauthState.userType,
        userId: userInfo.id
      });

      return { tokens, userInfo, provider, oauthState };
    } catch (error) {
      logger.error('OAuth callback failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Create agent OAuth connection with capabilities and permissions
   */
  public async createAgentConnection(
    agentId: string,
    providerId: string,
    tokens: OAuthTokenResponse,
    capabilities: AgentCapability[],
    permissions: string[]
  ): Promise<AgentOAuthConnection> {
    try {
      const provider = this.providers.get(providerId);
      if (!provider || !provider.agentConfig?.allowAgentAccess) {
        throw new ApiError(403, 'Agent access not allowed for this provider', 'AGENT_ACCESS_DENIED');
      }

      // Encrypt sensitive tokens
      const encryptedAccessToken = await this.encryptSecret(tokens.access_token);
      const encryptedRefreshToken = tokens.refresh_token ?
        await this.encryptSecret(tokens.refresh_token) : undefined;

      const connection: AgentOAuthConnection = {
        id: crypto.randomUUID(),
        agentId,
        providerId,
        providerType: provider.type,
        capabilities,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: tokens.expires_in ?
          new Date(Date.now() + tokens.expires_in * 1000) : undefined,
        scope: provider.scope,
        permissions,
        isActive: true,
        usageStats: {
          totalRequests: 0,
          dailyRequests: 0,
          lastResetDate: new Date(),
          errors: 0,
          rateLimitHits: 0
        },
        // createdAt: new Date(), // This will be set by the database
        // updatedAt: new Date() // This will be set by the database
      };

      const savedConnection = await this.databaseService.createAgentOAuthConnection(connection);

      await this.auditService.logEvent({
        eventType: AuditEventType.SECURITY_CONFIG_CHANGE,
        agentId,
        details: {
          action: 'create_agent_oauth_connection',
          providerId,
          providerType: provider.type,
          capabilities,
          permissions
        }
      });

      logger.info('Agent OAuth connection created', {
        agentId,
        providerId,
        providerType: provider.type,
        capabilities,
        permissions: permissions.length
      });

      return savedConnection;
    } catch (error) {
      logger.error('Failed to create agent OAuth connection', {
        agentId,
        providerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get and validate agent access token
   */
  public async getAgentAccessToken(agentId: string, providerId: string): Promise<string | null> {
    try {
      const connection = await this.getAgentConnection(agentId, providerId);
      if (!connection) {
        return null;
      }

      // Update usage statistics
      await this.updateConnectionUsage(connection);

      return await this.decryptSecret(connection.accessToken);
    } catch (error) {
      logger.error('Failed to get agent access token', {
        agentId,
        providerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Validate agent operation against provider permissions
   */
  public async validateAgentOperation(
    agentId: string,
    providerId: string,
    operation: string,
    capability: AgentCapability
  ): Promise<AgentOperationValidation> {
    try {
      const connection = await this.getAgentConnection(agentId, providerId);
      if (!connection || !connection.isActive) {
        return { allowed: false, reason: 'No active connection found' };
      }

      // Check capability
      if (!connection.capabilities.includes(capability)) {
        return { allowed: false, reason: `Missing capability: ${capability}` };
      }

      // Check permissions
      if (connection.permissions && !connection.permissions.includes(operation)) {
        return { allowed: false, reason: `Operation not permitted: ${operation}` };
      }

      // Check restrictions
      if (connection.restrictions?.allowedOperations &&
        !connection.restrictions.allowedOperations.includes(operation)) {
        return { allowed: false, reason: 'Operation not in allowed list' };
      }

      if (connection.restrictions?.blockedOperations?.includes(operation)) {
        return { allowed: false, reason: 'Operation is blocked' };
      }

      // Check rate limits
      const provider = await this.getProviderConfig(providerId);
      const rateLimit = provider?.agentConfig?.rateLimit;
      if (rateLimit && connection.usageStats) {
        const now = new Date();
        const windowStart = new Date(now.getTime() - rateLimit.windowMs);

        // Reset daily counter if needed
        if (connection.usageStats.lastResetDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          connection.usageStats.dailyRequests = 0;
          connection.usageStats.lastResetDate = now;
          await this.updateConnectionUsageStats(connection.id, connection.usageStats);
        }

        if (connection.usageStats.dailyRequests >= (provider.agentConfig?.monitoring?.maxDailyRequests || 1000)) {
          return {
            allowed: false,
            reason: 'Daily rate limit exceeded',
            rateLimit: {
              remaining: 0,
              resetTime: new Date(now.getTime() + 24 * 60 * 60 * 1000)
            }
          };
        }
      }

      return { allowed: true };
    } catch (error) {
      logger.error('Failed to validate agent operation', {
        agentId,
        providerId,
        operation,
        capability,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { allowed: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Private helper methods

  private async getAgentConnection(agentId: string, providerId: string): Promise<AgentOAuthConnection | null> {
    try {
      const connection = await this.databaseService.getAgentOAuthConnection(agentId, providerId);
      if (!connection || !connection.isActive) {
        return null;
      }

      // Check token expiration and refresh if needed
      if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
        return await this.refreshAgentToken(connection);
      }

      return connection;
    } catch (error) {
      logger.error('Failed to get agent OAuth connection', {
        agentId,
        providerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  private async refreshAgentToken(connection: AgentOAuthConnection): Promise<AgentOAuthConnection | null> {
    try {
      if (!connection.refreshToken) {
        logger.warn('No refresh token available', {
          agentId: connection.agentId,
          providerId: connection.providerId
        });
        return null;
      }

      const provider = this.providers.get(connection.providerId);
      if (!provider) {
        return null;
      }

      const endpoints = this.providerEndpoints.get(provider.type);
      if (!endpoints) {
        return null;
      }

      // Decrypt and use refresh token
      const decryptedRefreshToken = await this.decryptSecret(connection.refreshToken);
      const tokens = await this.refreshTokens(provider, endpoints, decryptedRefreshToken);

      // Update connection with new tokens
      const updatedConnection = {
        ...connection,
        accessToken: await this.encryptSecret(tokens.access_token),
        refreshToken: tokens.refresh_token ?
          await this.encryptSecret(tokens.refresh_token) : connection.refreshToken,
        tokenExpiresAt: tokens.expires_in ?
          new Date(Date.now() + tokens.expires_in * 1000) : undefined,
        updatedAt: new Date()
      };

      await this.databaseService.updateAgentOAuthConnection({
        ...updatedConnection,
        id: connection.id!
      } as any);

      logger.info('Agent OAuth token refreshed', {
        agentId: connection.agentId,
        providerId: connection.providerId
      });

      return updatedConnection;
    } catch (error) {
      logger.error('Failed to refresh agent OAuth token', {
        agentId: connection.agentId,
        providerId: connection.providerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  private async exchangeCodeForTokens(
    provider: OAuthProviderConfig,
    endpoints: ProviderEndpoints,
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret ? await this.decryptSecret(provider.clientSecret) : '',
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      ...(codeVerifier && { code_verifier: codeVerifier })
    });

    const response: AxiosResponse<OAuthTokenResponse> = await axios.post(
      endpoints.token,
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      }
    );

    return response.data;
  }

  private async getUserInfo(providerType: OAuthProviderType, accessToken: string): Promise<OAuthUserInfo> {
    const endpoints = this.providerEndpoints.get(providerType);
    if (!endpoints) {
      throw new ApiError(500, 'Provider endpoints not configured', 'ENDPOINTS_NOT_CONFIGURED');
    }

    const response: AxiosResponse<OAuthUserInfo> = await axios.get(
      endpoints.userInfo,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    return response.data;
  }

  private async refreshTokens(
    provider: OAuthProviderConfig,
    endpoints: ProviderEndpoints,
    refreshToken: string
  ): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret ? await this.decryptSecret(provider.clientSecret) : '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    const response: AxiosResponse<OAuthTokenResponse> = await axios.post(
      endpoints.token,
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      }
    );

    return response.data;
  }

  private async updateConnectionUsage(connection: AgentOAuthConnection): Promise<void> {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      let dailyRequests = connection.usageStats?.dailyRequests || 0;
      let lastResetDate = connection.usageStats?.lastResetDate || new Date();

      // Reset daily counter if new day
      if (lastResetDate < today) {
        dailyRequests = 0;
        lastResetDate = today;
      }

      const updatedStats = {
        ...connection.usageStats,
        totalRequests: (connection.usageStats?.totalRequests || 0) + 1,
        dailyRequests: dailyRequests + 1,
        lastResetDate
      };

      await this.databaseService.updateAgentOAuthConnection({
        ...connection,
        id: connection.id!,
        usageStats: updatedStats,
        lastUsedAt: now,
        updatedAt: now
      } as any);
    } catch (error) {
      logger.error('Failed to update connection usage', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private generateSecureState(): string {
    return base64url.encode(randomBytes(32));
  }

  private generateCodeVerifier(): string {
    return base64url.encode(randomBytes(32));
  }

  private generateCodeChallenge(verifier: string): string {
    return base64url.encode(createHash('sha256').update(verifier).digest());
  }

  private async encryptSecret(secret: string): Promise<string> {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync((config as any).security?.encryptionKey || 'default-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  private async decryptSecret(encryptedSecret: string): Promise<string> {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync((config as any).security?.encryptionKey || 'default-key', 'salt', 32);

    const [ivHex, encrypted] = encryptedSecret.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private async validateProviderConfig(config: OAuthProviderConfig): Promise<void> {
    if (!config.clientId) {
      throw new ApiError(400, 'Client ID is required', 'MISSING_CLIENT_ID');
    }

    if (!config.redirectUri) {
      throw new ApiError(400, 'Redirect URI is required', 'MISSING_REDIRECT_URI');
    }

    // Validate URLs
    try {
      new URL(config.redirectUri);
      new URL(config.authorizationUrl);
      new URL(config.tokenUrl);
      new URL(config.userInfoUrl);
    } catch (error) {
      throw new ApiError(400, 'Invalid URL in provider configuration', 'INVALID_URL');
    }
  }

  private async getProviderConfig(providerId: string): Promise<OAuthProviderConfig | null> {
    try {
      return await this.databaseService.findById('oauth_providers', providerId);
    } catch (error) {
      await this.auditService.logEvent({
        eventType: AuditEventType.SYSTEM_ERROR,
        details: { error: error.message, operation: 'getProviderConfig', providerId }
      });
      throw error;
    }
  }

  private async updateConnectionUsageStats(connectionId: string, stats: any): Promise<void> {
    await this.databaseService.update('agent_oauth_connections', connectionId, {
      usageStats: stats,
      lastUsedAt: new Date(),
      updatedAt: new Date()
    });
  }

  /**
   * Get available providers for a user type
   */
  public async getAvailableProviders(userType: UserType = UserType.HUMAN): Promise<OAuthProviderConfig[]> {
    const allProviders = Array.from(this.providers.values());
    return allProviders.filter(provider =>
      provider.isEnabled &&
      provider.securityConfig?.allowedUserTypes?.includes(userType)
    );
  }

  /**
   * Get agent connections
   */
  public async getAgentConnections(agentId: string): Promise<any[]> {
    const result = await this.databaseService.getAgentOAuthConnection(agentId, '');
    return Array.isArray(result) ? result : [result].filter(Boolean);
  }

  /**
   * Revoke agent connection
   */
  public async revokeAgentConnection(agentId: string, providerId: string): Promise<boolean> {
    try {
      const connection = await this.databaseService.getAgentOAuthConnection(agentId, providerId);
      if (connection) {
        await this.databaseService.updateAgentOAuthConnection({
          ...connection,
          isActive: false,
          updatedAt: new Date()
        });
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to revoke agent connection', { agentId, providerId, error });
      return false;
    }
  }

  /**
   * Get GitHub repositories for an agent
   */
  public async getGitHubRepos(agentId: string, providerId: string): Promise<any[]> {
    // This would implement GitHub API calls using the agent's OAuth token
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Get Gmail messages for an agent
   */
  public async getGmailMessages(agentId: string, providerId: string, options: any): Promise<any[]> {
    // This would implement Gmail API calls using the agent's OAuth token
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Record agent operation for audit purposes
   */
  public async recordAgentOperation(
    agentId: string,
    providerId: string,
    operation: string,
    result: any
  ): Promise<void> {
    try {
      await this.auditService.logEvent({
        eventType: AuditEventType.AGENT_OPERATION,
        agentId,
        details: {
          action: 'oauth_operation',
          providerId,
          operation,
          result: result ? 'success' : 'failure'
        }
      });
    } catch (error) {
      logger.error('Failed to record agent operation', {
        agentId,
        providerId,
        operation,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}