import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { OAuthService } from '@uaip/shared-services';
import * as crypto from 'crypto';
import * as _jwt from 'jsonwebtoken';
import axios, { AxiosResponse } from 'axios';
import {
  OAuthProviderConfig,
  OAuthProviderType,
  OAuthState,
  AgentOAuthConnection,
  UserType,
  AgentCapability,
  EnhancedUser as _EnhancedUser,
  SecurityLevel as _SecurityLevel,
  GitHubProviderConfig as _GitHubProviderConfig,
  EmailProviderConfig as _EmailProviderConfig,
  AuditEventType,
  AgentOperationValidation,
} from '@uaip/types';
import { AuditService } from './audit_service.js';
import { config } from '@uaip/config';
import { randomBytes, createHash } from 'crypto';

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope?: string;
}

type OAuthProviderConfigWithRevoke = OAuthProviderConfig & { revokeUrl?: string };
type OAuthProviderAgentConfig = { allowAgentAccess?: boolean };

interface OAuthUserInfo {
  id: string;
  email?: string;
  name?: string;
  login?: string;
  avatar_url?: string;
  [key: string]: unknown;
}

interface ProviderEndpoints {
  authorization: string;
  token: string;
  userInfo: string;
  revoke?: string;
}

export class OAuthProviderService {
  private providers: Map<string, OAuthProviderConfig> = new Map();
  private providerEndpoints: Map<OAuthProviderType, ProviderEndpoints> = new Map();
  private oauthService: OAuthService;

  constructor(private auditService: AuditService) {
    this.oauthService = OAuthService.getInstance();
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
      revoke: 'https://api.github.com/applications/{client_id}/grant',
    });

    this.providerEndpoints.set(OAuthProviderType.GOOGLE, {
      authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      userInfo: 'https://www.googleapis.com/oauth2/v2/userinfo',
      revoke: 'https://oauth2.googleapis.com/revoke',
    });

    this.providerEndpoints.set(OAuthProviderType.GMAIL, {
      authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      userInfo: 'https://www.googleapis.com/oauth2/v2/userinfo',
      revoke: 'https://oauth2.googleapis.com/revoke',
    });

    this.providerEndpoints.set(OAuthProviderType.ZOHO, {
      authorization: 'https://accounts.zoho.com/oauth/v2/auth',
      token: 'https://accounts.zoho.com/oauth/v2/token',
      userInfo: 'https://accounts.zoho.com/oauth/user/info',
      revoke: 'https://accounts.zoho.com/oauth/v2/token/revoke',
    });

    this.providerEndpoints.set(OAuthProviderType.ZOHO_MAIL, {
      authorization: 'https://accounts.zoho.com/oauth/v2/auth',
      token: 'https://accounts.zoho.com/oauth/v2/token',
      userInfo: 'https://accounts.zoho.com/oauth/user/info',
      revoke: 'https://accounts.zoho.com/oauth/v2/token/revoke',
    });

    this.providerEndpoints.set(OAuthProviderType.MICROSOFT, {
      authorization: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userInfo: 'https://graph.microsoft.com/v1.0/me',
      revoke: 'https://login.microsoftonline.com/common/oauth2/v2.0/logout',
    });

    this.providerEndpoints.set(OAuthProviderType.OUTLOOK, {
      authorization: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userInfo: 'https://graph.microsoft.com/v1.0/me',
      revoke: 'https://login.microsoftonline.com/common/oauth2/v2.0/logout',
    });
  }

  /**
   * Load OAuth providers from database
   */
  private async loadProviders(): Promise<void> {
    try {
      const providers = await this.oauthService.findEnabledOAuthProviders();
      for (const provider of providers) {
        // @ts-expect-error -- Argument type mismatch
        this.providers.set(provider.id, provider as unknown);
      }
      logger.info('OAuth providers loaded', { count: providers.length });
    } catch (error) {
      logger.error('Failed to load OAuth providers', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Create OAuth provider configuration
   */
  public async createProvider(providerConfig: OAuthProviderConfig): Promise<OAuthProviderConfig> {
    try {
      // Validate provider configuration
      await this.validateProviderConfig(providerConfig);

      // Encrypt sensitive data
      if (providerConfig.clientSecret) {
        providerConfig.clientSecret = await this.encryptSecret(providerConfig.clientSecret);
      }

      // Save to database
      const savedProvider = await this.oauthService.createOAuthProvider({
        name: providerConfig.name || `${providerConfig.type}-provider`,
        type: providerConfig.type,
        clientId: providerConfig.clientId,
        clientSecret: providerConfig.clientSecret,
        redirectUri: providerConfig.redirectUri,
        scope: providerConfig.scope,
        authorizationUrl: providerConfig.authorizationUrl,
        tokenUrl: providerConfig.tokenUrl,
        userInfoUrl: providerConfig.userInfoUrl,
        revokeUrl: (providerConfig as OAuthProviderConfigWithRevoke).revokeUrl,
        isEnabled: providerConfig.isEnabled || true,
      });
      // @ts-expect-error -- Argument type mismatch
      this.providers.set(savedProvider.id, savedProvider as unknown);

      const savedProviderAgentCfg = savedProvider.agentConfig as OAuthProviderAgentConfig | undefined;
      await this.auditService.logEvent({
        eventType: AuditEventType.SECURITY_CONFIG_CHANGE,
        details: {
          action: 'create_oauth_provider',
          providerId: savedProvider.id,
          providerType: savedProvider.type,
          agentAccess: savedProviderAgentCfg?.allowAgentAccess || false,
        },
      });

      logger.info('OAuth provider created', {
        providerId: savedProvider.id,
        type: savedProvider.type,
        agentAccess: savedProviderAgentCfg?.allowAgentAccess || false,
      });

      return savedProvider as unknown;
    } catch (error) {
      logger.error('Failed to create OAuth provider', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
          throw new ApiError(
            403,
            'Agent access not allowed for this provider',
            'AGENT_ACCESS_DENIED'
          );
        }

        if (agentCapabilities && provider.agentConfig?.requiredCapabilities) {
          const hasRequiredCapabilities = provider.agentConfig.requiredCapabilities.every((cap) =>
            agentCapabilities.includes(cap)
          );
          if (!hasRequiredCapabilities) {
            throw new ApiError(
              403,
              'Agent lacks required capabilities',
              'INSUFFICIENT_CAPABILITIES'
            );
          }
        }
      }

      const endpoints = this.providerEndpoints.get(provider.type);
      if (!endpoints) {
        throw new ApiError(500, 'Provider endpoints not configured', 'ENDPOINTS_NOT_CONFIGURED');
      }

      // Generate secure state and PKCE parameters
      const state = this.generateSecureState();
      const codeVerifier = provider.securityConfig?.requirePKCE
        ? this.generateCodeVerifier()
        : undefined;
      const codeChallenge = codeVerifier ? this.generateCodeChallenge(codeVerifier) : undefined;

      // Store OAuth state with expiration
      const _oauthState: OAuthState = {
        state,
        providerId,
        redirectUri,
        codeVerifier: provider.securityConfig?.requirePKCE ? codeVerifier : undefined,
        scope: provider.scope,
        userType,
        agentCapabilities,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      };

      const stateEntity = await this.oauthService.createOAuthState({
        providerId,
        redirectUri,
        userType,
        agentCapabilities,
        codeVerifier: codeVerifier,
      });

      // Build authorization URL with proper parameters
      // @ts-expect-error -- Argument type mismatch
      const params = new URLSearchParams({
        client_id: provider.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: provider.scope.join(' '),
        state: stateEntity.state,
        ...(provider.securityConfig?.requirePKCE && {
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        }),
        ...provider.additionalParams,
      });

      const authUrl = `${endpoints.authorization}?${params.toString()}`;

      logger.info('OAuth authorization URL generated', {
        providerId,
        providerType: provider.type,
        userType,
        agentCapabilities: agentCapabilities?.length || 0,
      });

      return { url: authUrl, state, codeVerifier };
    } catch (error) {
      logger.error('Failed to generate authorization URL', {
        providerId,
        userType,
        error: error instanceof Error ? error.message : 'Unknown error',
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
      const oauthStateEntity = await this.oauthService.verifyAndConsumeOAuthState(state);
      if (!oauthStateEntity) {
        throw new ApiError(400, 'Invalid or expired OAuth state', 'INVALID_STATE');
      }

      // Map entity to expected format
      const oauthState: OAuthState = {
        // @ts-expect-error -- Type not assignable
        state: oauthStateEntity.state,
        // @ts-expect-error -- Type not assignable
        providerId: oauthStateEntity.providerId,
        // @ts-expect-error -- Type not assignable
        redirectUri: oauthStateEntity.redirectUri,
        // @ts-expect-error -- Type not assignable
        codeVerifier: oauthStateEntity.codeVerifier,
        scope: [], // This will be set from provider
        // @ts-expect-error -- Type not assignable
        userType: oauthStateEntity.userType,
        // @ts-expect-error -- Missing properties in type
        agentCapabilities: oauthStateEntity.agentCapabilities,
        // @ts-expect-error -- Missing properties in type
        createdAt: oauthStateEntity.createdAt,
        // @ts-expect-error -- Missing properties in type
        expiresAt: oauthStateEntity.expiresAt,
      };

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

      // OAuth state already cleaned up by verifyAndConsumeOAuthState

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
            name: userInfo.name || userInfo.login,
          },
        },
      });

      logger.info('OAuth callback handled successfully', {
        providerId: provider.id,
        providerType: provider.type,
        userType: oauthState.userType,
        userId: userInfo.id,
      });

      return { tokens, userInfo, provider, oauthState };
    } catch (error) {
      logger.error('OAuth callback failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
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
        throw new ApiError(
          403,
          'Agent access not allowed for this provider',
          'AGENT_ACCESS_DENIED'
        );
      }

      // Encrypt sensitive tokens
      const encryptedAccessToken = await this.encryptSecret(tokens.access_token);
      const encryptedRefreshToken = tokens.refresh_token
        ? await this.encryptSecret(tokens.refresh_token)
        : undefined;

      const _connection: AgentOAuthConnection = {
        id: crypto.randomUUID(),
        agentId,
        providerId,
        providerType: provider.type,
        capabilities,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : undefined,
        scope: provider.scope,
        permissions,
        isActive: true,
        usageStats: {
          totalRequests: 0,
          dailyRequests: 0,
          lastResetDate: new Date(),
          errors: 0,
          rateLimitHits: 0,
        },
        // createdAt: new Date(), // This will be set by the database
        // updatedAt: new Date() // This will be set by the database
      };

      const savedConnection = await this.oauthService.createAgentOAuthConnection({
        agentId,
        providerId,
        providerType: provider.type,
        capabilities,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : undefined,
        scope: provider.scope,
      });

      await this.auditService.logEvent({
        eventType: AuditEventType.SECURITY_CONFIG_CHANGE,
        agentId,
        details: {
          action: 'create_agent_oauth_connection',
          providerId,
          providerType: provider.type,
          capabilities,
          permissions,
        },
      });

      logger.info('Agent OAuth connection created', {
        agentId,
        providerId,
        providerType: provider.type,
        capabilities,
        permissions: permissions.length,
      });

      return savedConnection;
    } catch (error) {
      logger.error('Failed to create agent OAuth connection', {
        agentId,
        providerId,
        error: error instanceof Error ? error.message : 'Unknown error',
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
        error: error instanceof Error ? error.message : 'Unknown error',
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
      if (
        connection.restrictions?.allowedOperations &&
        !connection.restrictions.allowedOperations.includes(operation)
      ) {
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
        const _windowStart = new Date(now.getTime() - rateLimit.windowMs);

        // Reset daily counter if needed
        if (
          connection.usageStats.lastResetDate <
          new Date(now.getFullYear(), now.getMonth(), now.getDate())
        ) {
          connection.usageStats.dailyRequests = 0;
          connection.usageStats.lastResetDate = now;
          await this.updateConnectionUsageStats(connection.id, connection.usageStats);
        }

        if (
          connection.usageStats.dailyRequests >=
          (provider.agentConfig?.monitoring?.maxDailyRequests || 1000)
        ) {
          return {
            allowed: false,
            reason: 'Daily rate limit exceeded',
            rateLimit: {
              remaining: 0,
              resetTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            },
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
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { allowed: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Private helper methods

  private async getAgentConnection(
    agentId: string,
    providerId: string
  ): Promise<AgentOAuthConnection | null> {
    try {
      const connection = await this.oauthService.findAgentOAuthConnection(agentId, providerId);
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
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  private async refreshAgentToken(
    connection: AgentOAuthConnection
  ): Promise<AgentOAuthConnection | null> {
    try {
      if (!connection.refreshToken) {
        logger.warn('No refresh token available', {
          agentId: connection.agentId,
          providerId: connection.providerId,
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
        refreshToken: tokens.refresh_token
          ? await this.encryptSecret(tokens.refresh_token)
          : connection.refreshToken,
        tokenExpiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : undefined,
        updatedAt: new Date(),
      };

      await this.oauthService.updateOAuthConnectionToken(connection.id, {
        accessToken: await this.encryptSecret(tokens.access_token),
        refreshToken: tokens.refresh_token
          ? await this.encryptSecret(tokens.refresh_token)
          : undefined,
        tokenExpiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : undefined,
      });

      logger.info('Agent OAuth token refreshed', {
        agentId: connection.agentId,
        providerId: connection.providerId,
      });

      return updatedConnection;
    } catch (error) {
      logger.error('Failed to refresh agent OAuth token', {
        agentId: connection.agentId,
        providerId: connection.providerId,
        error: error instanceof Error ? error.message : 'Unknown error',
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
      ...(codeVerifier && { code_verifier: codeVerifier }),
    });

    const response: AxiosResponse<OAuthTokenResponse> = await axios.post(endpoints.token, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    });

    return response.data;
  }

  private async getUserInfo(
    providerType: OAuthProviderType,
    accessToken: string
  ): Promise<OAuthUserInfo> {
    const endpoints = this.providerEndpoints.get(providerType);
    if (!endpoints) {
      throw new ApiError(500, 'Provider endpoints not configured', 'ENDPOINTS_NOT_CONFIGURED');
    }

    const response: AxiosResponse<OAuthUserInfo> = await axios.get(endpoints.userInfo, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

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
      grant_type: 'refresh_token',
    });

    const response: AxiosResponse<OAuthTokenResponse> = await axios.post(endpoints.token, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    });

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

      const _updatedStats = {
        ...connection.usageStats,
        totalRequests: (connection.usageStats?.totalRequests || 0) + 1,
        dailyRequests: dailyRequests + 1,
        lastResetDate,
      };

      // TODO: Implement usage stats update in domain service
      // await this.oauthService.updateConnectionUsageStats(connection.id, updatedStats);
    } catch (error) {
      logger.error('Failed to update connection usage', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private generateSecureState(): string {
    return randomBytes(32).toString('base64url');
  }

  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  private getEncryptionKey(): string {
    const encryptionKey = config.security?.encryptionKey;
    if (!encryptionKey) {
      throw new ApiError(
        500,
        'OAuth encryption key is not configured. Set ENCRYPTION_KEY in environment.',
        'MISSING_ENCRYPTION_KEY'
      );
    }
    return encryptionKey;
  }

  private async encryptSecret(secret: string): Promise<string> {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(this.getEncryptionKey(), 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  private async decryptSecret(encryptedSecret: string): Promise<string> {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(this.getEncryptionKey(), 'salt', 32);

    const parts = encryptedSecret.split(':');

    if (parts.length === 3) {
      const [ivHex, authTagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    // Legacy format (iv:encrypted without auth tag) — decrypt but log migration needed
    const [ivHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    logger.warn('Decrypted secret using legacy format without auth tag — re-encrypt recommended');
    return decrypted;
  }

  private async validateProviderConfig(providerConfig: OAuthProviderConfig): Promise<void> {
    if (!providerConfig.clientId) {
      throw new ApiError(400, 'Client ID is required', 'MISSING_CLIENT_ID');
    }

    if (!providerConfig.redirectUri) {
      throw new ApiError(400, 'Redirect URI is required', 'MISSING_REDIRECT_URI');
    }

    // Validate URLs
    try {
      const _redirectUrl = new URL(providerConfig.redirectUri);
      const _authorizationUrl = new URL(providerConfig.authorizationUrl);
      const _tokenUrl = new URL(providerConfig.tokenUrl);
      const _userInfoUrl = new URL(providerConfig.userInfoUrl);
    } catch {
      throw new ApiError(400, 'Invalid URL in provider configuration', 'INVALID_URL');
    }
  }

  private async getProviderConfig(providerId: string): Promise<OAuthProviderConfig | null> {
    try {
      const provider = await this.oauthService.findOAuthProvider(providerId);
      return provider as unknown;
    } catch (error) {
      await this.auditService.logEvent({
        eventType: AuditEventType.SYSTEM_ERROR,
        details: { error: error.message, operation: 'getProviderConfig', providerId },
      });
      throw error;
    }
  }

  private async updateConnectionUsageStats(connectionId: string, stats: unknown): Promise<void> {
    // TODO: Implement usage stats update in OAuthService domain service
    // For now, this is a placeholder
    logger.info('Usage stats update requested', { connectionId, stats });
  }

  /**
   * Get available providers for a user type
   */
  public async getAvailableProviders(
    userType: UserType = UserType.HUMAN
  ): Promise<OAuthProviderConfig[]> {
    const allProviders = Array.from(this.providers.values());
    return allProviders.filter(
      (provider) =>
        provider.isEnabled && provider.securityConfig?.allowedUserTypes?.includes(userType)
    );
  }

  /**
   * Get agent connections
   */
  public async getAgentConnections(agentId: string): Promise<unknown[]> {
    const result = await this.oauthService.findAgentOAuthConnections(agentId);
    return Array.isArray(result) ? result : [result].filter(Boolean);
  }

  /**
   * Revoke agent connection
   */
  public async revokeAgentConnection(agentId: string, providerId: string): Promise<boolean> {
    try {
      const connection = await this.oauthService.findAgentOAuthConnection(agentId, providerId);
      if (connection) {
        // @ts-expect-error -- Argument type mismatch
        await this.oauthService.deactivateOAuthConnection(connection.id);
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
  public async getGitHubRepos(agentId: string, providerId: string): Promise<unknown[]> {
    const accessToken = await this.getAgentAccessToken(agentId, providerId);
    if (!accessToken) {
      logger.warn('No access token available for GitHub repos', { agentId, providerId });
      return [];
    }

    const response = await fetch(
      'https://api.github.com/user/repos?type=all&sort=updated&per_page=30',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message =
        typeof errorBody?.message === 'string'
          ? errorBody.message
          : 'GitHub API request failed';
      logger.error('GitHub repos API error', {
        agentId,
        providerId,
        status: response.status,
        message,
      });
      throw new ApiError(response.status, `GitHub API error: ${message}`, 'GITHUB_API_ERROR');
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  public async getGitHubRepo(
    agentId: string,
    providerId: string,
    repository: string
  ): Promise<unknown> {
    const accessToken = await this.getAgentAccessToken(agentId, providerId);
    if (!accessToken) {
      throw new ApiError(401, 'No OAuth connection found for GitHub', 'NO_OAUTH_CONNECTION');
    }

    const response = await fetch(`https://api.github.com/repos/${repository}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message =
        typeof errorBody?.message === 'string'
          ? errorBody.message
          : 'GitHub API request failed';
      logger.error('GitHub repo API error', {
        agentId,
        providerId,
        repository,
        status: response.status,
        message,
      });
      throw new ApiError(response.status, `GitHub API error: ${message}`, 'GITHUB_API_ERROR');
    }

    return response.json();
  }

  /**
   * Get Gmail messages for an agent
   */
  public async getGmailMessages(
    agentId: string,
    providerId: string,
    query: unknown
  ): Promise<unknown[]> {
    const accessToken = await this.getAgentAccessToken(agentId, providerId);
    if (!accessToken) {
      logger.warn('No access token available for Gmail messages', { agentId, providerId });
      return [];
    }

    const params = new URLSearchParams({ maxResults: '20' });
    if (typeof query === 'string' && query.length > 0) {
      params.set('q', query);
    }

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message =
        typeof errorBody?.error?.message === 'string'
          ? errorBody.error.message
          : 'Gmail API request failed';
      logger.error('Gmail messages API error', {
        agentId,
        providerId,
        status: response.status,
        message,
      });
      throw new ApiError(response.status, `Gmail API error: ${message}`, 'GMAIL_API_ERROR');
    }

    const data = await response.json();
    return Array.isArray(data?.messages) ? data.messages : [];
  }

  public async getGmailMessage(
    agentId: string,
    providerId: string,
    messageId: string
  ): Promise<unknown> {
    const accessToken = await this.getAgentAccessToken(agentId, providerId);
    if (!accessToken) {
      throw new ApiError(401, 'No OAuth connection found for Gmail', 'NO_OAUTH_CONNECTION');
    }

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message =
        typeof errorBody?.error?.message === 'string'
          ? errorBody.error.message
          : 'Gmail API request failed';
      logger.error('Gmail message API error', {
        agentId,
        providerId,
        messageId,
        status: response.status,
        message,
      });
      throw new ApiError(response.status, `Gmail API error: ${message}`, 'GMAIL_API_ERROR');
    }

    return response.json();
  }

  /**
   * Record agent operation for audit purposes
   */
  public async recordAgentOperation(
    agentId: string,
    providerId: string,
    operation: string,
    result: unknown
  ): Promise<void> {
    try {
      await this.auditService.logEvent({
        eventType: AuditEventType.AGENT_OPERATION,
        agentId,
        details: {
          action: 'oauth_operation',
          providerId,
          operation,
          result: result ? 'success' : 'failure',
        },
      });
    } catch (error) {
      logger.error('Failed to record agent operation', {
        agentId,
        providerId,
        operation,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
