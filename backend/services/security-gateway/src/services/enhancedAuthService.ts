import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { DatabaseService } from '@uaip/shared-services';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  EnhancedUser,
  Session,
  EnhancedSecurityContext,
  MFAChallenge,
  MFAMethod,
  UserType,
  AgentCapability,
  OAuthProviderType,
  AuthenticationMethod,
  SecurityLevel,
  SessionStatus,
  AuditEventType
} from '@uaip/types';
import { OAuthProviderService } from './oauthProviderService.js';
import { AuditService } from './auditService.js';
import { config } from '@uaip/config';
import speakeasy from 'speakeasy';

interface AuthenticationResult {
  user: EnhancedUser;
  session: Session;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
  requiresMFA: boolean;
  mfaChallenge?: MFAChallenge;
}

interface AgentAuthenticationRequest {
  agentId: string;
  agentToken: string;
  capabilities: AgentCapability[];
  requestedProviders: OAuthProviderType[];
  ipAddress?: string;
  userAgent?: string;
}

export class EnhancedAuthService {
  constructor(
    private databaseService: DatabaseService,
    private oauthProviderService: OAuthProviderService,
    private auditService: AuditService
  ) { }

  /**
   * Authenticate user with OAuth provider
   */
  public async authenticateWithOAuth(
    code: string,
    state: string,
    redirectUri: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthenticationResult> {
    try {
      // Handle OAuth callback
      const { tokens, userInfo, provider, oauthState } = await this.oauthProviderService.handleCallback(
        code,
        state,
        redirectUri
      );

      // Find or create user
      let user = await this.databaseService.getUserByOAuthProvider(
        provider.type,
        userInfo.id
      );

      if (!user) {
        user = await this.createUserFromOAuth(userInfo, provider, oauthState);
      } else {
        await this.updateUserOAuthConnection(user, tokens, provider, userInfo);
      }

      // Create session
      const session = await this.createSession(
        user,
        AuthenticationMethod.OAUTH,
        provider.type,
        ipAddress,
        userAgent,
        oauthState.agentCapabilities
      );

      // Generate JWT tokens
      const jwtTokens = await this.generateJWTTokens(user, session);

      // Check MFA requirement
      const { requiresMFA, mfaChallenge } = await this.checkMFARequirement(user, session);

      await this.auditService.logEvent({
        eventType: AuditEventType.LOGIN_SUCCESS,
        userId: user.id,
        details: {
          authMethod: AuthenticationMethod.OAUTH,
          provider: provider.type,
          userType: user.userType,
          mfaRequired: requiresMFA
        },
        ipAddress,
        userAgent
      });

      logger.info('OAuth authentication successful', {
        userId: user.id,
        userType: user.userType,
        provider: provider.type,
        mfaRequired: requiresMFA
      });

      return {
        user,
        session,
        tokens: jwtTokens,
        requiresMFA,
        mfaChallenge
      };
    } catch (error) {
      logger.error('OAuth authentication failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Authenticate agent with token and capabilities
   */
  public async authenticateAgent(
    request: AgentAuthenticationRequest
  ): Promise<AuthenticationResult> {
    try {
      // Verify agent token
      const agent = await this.verifyAgentToken(request.agentToken);
      if (!agent || agent.userType !== UserType.AGENT) {
        throw new ApiError(401, 'Invalid agent token', 'INVALID_AGENT_TOKEN');
      }

      // Validate capabilities
      if (!this.validateAgentCapabilities(agent, request.capabilities)) {
        throw new ApiError(403, 'Agent lacks required capabilities', 'INSUFFICIENT_CAPABILITIES');
      }

      // Check provider access
      for (const providerType of request.requestedProviders) {
        const hasAccess = await this.validateAgentProviderAccess(agent.id, providerType);
        if (!hasAccess) {
          throw new ApiError(403, `Agent cannot access provider: ${providerType}`, 'PROVIDER_ACCESS_DENIED');
        }
      }

      // Create agent session
      const session = await this.createSession(
        agent,
        AuthenticationMethod.AGENT_TOKEN,
        undefined,
        request.ipAddress,
        request.userAgent,
        request.capabilities
      );

      // Generate JWT tokens
      const jwtTokens = await this.generateJWTTokens(agent, session);

      await this.auditService.logEvent({
        eventType: AuditEventType.LOGIN_SUCCESS,
        userId: agent.id,
        agentId: agent.id,
        details: {
          authMethod: AuthenticationMethod.AGENT_TOKEN,
          capabilities: request.capabilities,
          requestedProviders: request.requestedProviders
        },
        ipAddress: request.ipAddress,
        userAgent: request.userAgent
      });

      logger.info('Agent authentication successful', {
        agentId: agent.id,
        capabilities: request.capabilities,
        requestedProviders: request.requestedProviders
      });

      return {
        user: agent,
        session,
        tokens: jwtTokens,
        requiresMFA: false
      };
    } catch (error) {
      logger.error('Agent authentication failed', {
        agentId: request.agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Connect OAuth provider to existing user or agent
   */
  public async connectOAuthProvider(
    userId: string,
    code: string,
    state: string,
    redirectUri: string
  ): Promise<{ success: boolean; connection?: any }> {
    try {
      const user = await this.databaseService.getUserById(userId);
      if (!user) {
        throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
      }

      const { tokens, userInfo, provider, oauthState } = await this.oauthProviderService.handleCallback(
        code,
        state,
        redirectUri
      );

      if (user.userType === UserType.AGENT && oauthState.agentCapabilities) {
        // Create agent OAuth connection
        const connection = await this.oauthProviderService.createAgentConnection(
          user.id,
          provider.id,
          tokens,
          oauthState.agentCapabilities,
          provider.agentConfig?.permissions || []
        );

        await this.auditService.logEvent({
          eventType: AuditEventType.SECURITY_CONFIG_CHANGE,
          userId: user.id,
          agentId: user.id,
          details: {
            action: 'connect_oauth_provider',
            provider: provider.type,
            capabilities: oauthState.agentCapabilities
          }
        });

        return { success: true, connection };
      } else {
        // Update user OAuth connection
        await this.updateUserOAuthConnection(user, tokens, provider, userInfo);

        await this.auditService.logEvent({
          eventType: AuditEventType.SECURITY_CONFIG_CHANGE,
          userId: user.id,
          details: {
            action: 'connect_oauth_provider',
            provider: provider.type
          }
        });

        return { success: true };
      }
    } catch (error) {
      logger.error('Failed to connect OAuth provider', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Create MFA challenge
   */
  public async createMFAChallenge(
    userId: string,
    sessionId: string,
    method: MFAMethod
  ): Promise<MFAChallenge> {
    const user = await this.databaseService.findById('users', userId);
    if (!user) {
      throw new Error('User not found');
    }

    const mfaMethod = user.mfaMethods?.find(m => m.type === method && m.isEnabled);
    if (!mfaMethod) {
      throw new Error('MFA method not configured');
    }

    let challenge: string;
    switch (method) {
      case MFAMethod.TOTP:
        // Generate TOTP challenge
        challenge = speakeasy.totp({
          secret: mfaMethod.secret,
          encoding: 'base32'
        });
        break;
      case MFAMethod.SMS:
      case MFAMethod.EMAIL:
        // Generate 6-digit code
        challenge = Math.floor(100000 + Math.random() * 900000).toString();
        break;
      default:
        throw new Error(`Unsupported MFA method: ${method}`);
    }

    const mfaChallenge: MFAChallenge = {
      id: this.generateId(),
      userId,
      sessionId,
      method,
      challenge: await this.encryptChallenge(challenge),
      attempts: 0,
      maxAttempts: 3,
      isVerified: false,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    };

    await this.databaseService.create('mfa_challenges', mfaChallenge);

    // Send challenge to user (implementation depends on method)
    await this.sendMFAChallenge(user, mfaChallenge, challenge);

    return mfaChallenge;
  }

  /**
   * Verify MFA challenge
   */
  public async verifyMFAChallenge(
    challengeId: string,
    response: string
  ): Promise<{ verified: boolean; session?: Session }> {
    try {
      const challenge = await this.databaseService.getMFAChallenge(challengeId);
      if (!challenge || challenge.expiresAt < new Date()) {
        throw new ApiError(400, 'Invalid or expired MFA challenge', 'INVALID_MFA_CHALLENGE');
      }

      if (challenge.isVerified) {
        throw new ApiError(400, 'MFA challenge already verified', 'CHALLENGE_ALREADY_VERIFIED');
      }

      if (challenge.attempts >= challenge.maxAttempts) {
        throw new ApiError(400, 'Maximum MFA attempts exceeded', 'MAX_ATTEMPTS_EXCEEDED');
      }

      // Increment attempts
      challenge.attempts++;
      await this.databaseService.updateMFAChallenge(challenge);

      // Verify response based on method
      const decryptedChallenge = await this.decryptChallenge(challenge.challenge);
      let verified = false;

      switch (challenge.method) {
        case MFAMethod.TOTP:
          verified = this.verifyTOTPResponse(response, decryptedChallenge);
          break;
        case MFAMethod.SMS:
        case MFAMethod.EMAIL:
          verified = response === decryptedChallenge;
          break;
        default:
          throw new ApiError(400, 'Unsupported MFA method', 'UNSUPPORTED_MFA_METHOD');
      }

      if (verified) {
        // Mark challenge as verified
        challenge.isVerified = true;
        challenge.verifiedAt = new Date();
        await this.databaseService.updateMFAChallenge(challenge);

        // Update session to mark MFA as verified
        const session = await this.databaseService.getSession(challenge.sessionId);
        if (session) {
          session.mfaVerified = true;
          await this.databaseService.updateSession(session);
        }

        await this.auditService.logEvent({
          eventType: AuditEventType.MFA_SUCCESS,
          userId: challenge.userId,
          details: {
            method: challenge.method,
            challengeId
          }
        });

        logger.info('MFA challenge verified successfully', {
          userId: challenge.userId,
          method: challenge.method,
          challengeId
        });

        return { verified: true, session };
      } else {
        await this.auditService.logEvent({
          eventType: AuditEventType.MFA_FAILED,
          userId: challenge.userId,
          details: {
            method: challenge.method,
            challengeId,
            attempts: challenge.attempts
          }
        });

        return { verified: false };
      }
    } catch (error) {
      logger.error('Failed to verify MFA challenge', {
        challengeId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Create enhanced security context from session
   */
  public async createSecurityContext(sessionId: string): Promise<EnhancedSecurityContext> {
    try {
      const session = await this.databaseService.getSession(sessionId);
      if (!session || session.status !== SessionStatus.ACTIVE) {
        throw new ApiError(401, 'Invalid or inactive session', 'INVALID_SESSION');
      }

      const user = await this.databaseService.getUserById(session.userId);
      if (!user) {
        throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
      }

      // Get user permissions
      const permissions = await this.databaseService.getUserPermissions(user.id);

      // Build enhanced security context
      const securityContext: EnhancedSecurityContext = {
        userId: user.id,
        sessionId: session.id,
        userType: user.userType,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        department: user.department,
        role: user.role,
        permissions: permissions.map(p => p.resource),
        securityLevel: user.securityClearance,
        lastAuthentication: session.createdAt,
        mfaVerified: session.mfaVerified,
        riskScore: session.riskScore,
        authenticationMethod: session.authenticationMethod,
        oauthProvider: session.oauthProvider,
        agentCapabilities: session.agentCapabilities,
        deviceTrusted: session.deviceInfo?.isTrusted || false,
        locationTrusted: this.isLocationTrusted(user, session),
        agentContext: user.userType === UserType.AGENT ? {
          agentId: user.id,
          agentName: user.name,
          capabilities: user.agentConfig?.capabilities || [],
          connectedProviders: await this.getAgentConnectedProviders(user.id),
          operationLimits: {
            maxDailyOperations: user.agentConfig?.monitoring?.maxDailyOperations,
            currentDailyOperations: 0,
            maxConcurrentOperations: user.agentConfig?.maxConcurrentSessions || 5,
            currentConcurrentOperations: 0
          }
        } : undefined
      };

      return securityContext;
    } catch (error) {
      logger.error('Failed to create security context', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  // Private helper methods

  private async createUserFromOAuth(
    userInfo: any,
    provider: any,
    oauthState: any
  ): Promise<EnhancedUser> {
    const user: EnhancedUser = {
      id: crypto.randomUUID(),
      email: userInfo.email || `${userInfo.id}@${provider.type}.oauth`,
      name: userInfo.name || userInfo.login || 'OAuth User',
      role: oauthState.userType === UserType.AGENT ? 'agent' : 'user',
      userType: oauthState.userType || UserType.HUMAN,
      securityClearance: SecurityLevel.MEDIUM,
      isActive: true,
      oauthProviders: [{
        providerId: provider.id,
        providerType: provider.type,
        providerUserId: userInfo.id,
        email: userInfo.email,
        displayName: userInfo.name || userInfo.login,
        avatarUrl: userInfo.avatar_url,
        isVerified: true,
        isPrimary: true,
        linkedAt: new Date(),
        capabilities: oauthState.agentCapabilities
      }],
      agentConfig: oauthState.userType === UserType.AGENT ? {
        capabilities: oauthState.agentCapabilities || [],
        maxConcurrentSessions: 5,
        allowedProviders: [provider.type],
        securityLevel: SecurityLevel.MEDIUM,
        monitoring: {
          logLevel: 'standard',
          alertOnNewProvider: true,
          alertOnUnusualActivity: true
        }
      } : undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return await this.databaseService.createUser(user);
  }

  private async updateUserOAuthConnection(
    user: EnhancedUser,
    tokens: any,
    provider: any,
    userInfo: any
  ): Promise<void> {
    const existingProvider = user.oauthProviders.find(p => p.providerId === provider.id);

    if (existingProvider) {
      existingProvider.lastUsedAt = new Date();
      existingProvider.email = userInfo.email;
      existingProvider.displayName = userInfo.name || userInfo.login;
      existingProvider.avatarUrl = userInfo.avatar_url;
    } else {
      user.oauthProviders.push({
        providerId: provider.id,
        providerType: provider.type,
        providerUserId: userInfo.id,
        email: userInfo.email,
        displayName: userInfo.name || userInfo.login,
        avatarUrl: userInfo.avatar_url,
        isVerified: true,
        isPrimary: user.oauthProviders.length === 0,
        linkedAt: new Date()
      });
    }

    await this.databaseService.updateUser(user);
  }

  private async createSession(
    user: EnhancedUser,
    authMethod: AuthenticationMethod,
    oauthProvider?: OAuthProviderType,
    ipAddress?: string,
    userAgent?: string,
    agentCapabilities?: AgentCapability[]
  ): Promise<Session> {
    const session: Session = {
      id: crypto.randomUUID(),
      userId: user.id,
      sessionToken: this.generateSessionToken(),
      refreshToken: this.generateSessionToken(),
      status: SessionStatus.ACTIVE,
      userType: user.userType,
      ipAddress,
      userAgent,
      authenticationMethod: authMethod,
      oauthProvider,
      agentCapabilities,
      mfaVerified: false,
      riskScore: 0,
      expiresAt: new Date(Date.now() + (user.securityPreferences?.sessionTimeout || 3600) * 1000),
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return await this.databaseService.createSession(session);
  }

  private async generateJWTTokens(
    user: EnhancedUser,
    session: Session
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = {
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      role: user.role,
      userType: user.userType,
      securityLevel: user.securityClearance,
      agentCapabilities: session.agentCapabilities
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.accessTokenExpiry || '15m'
    });

    const refreshToken = jwt.sign(
      { ...payload, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshTokenExpiry || '7d' }
    );

    return { accessToken, refreshToken };
  }

  private async checkMFARequirement(
    user: EnhancedUser,
    session: Session
  ): Promise<{ requiresMFA: boolean; mfaChallenge?: MFAChallenge }> {
    if (!user.mfaEnabled || user.mfaMethods.length === 0) {
      return { requiresMFA: false };
    }

    if (user.securityPreferences?.requireMFAForSensitiveOperations) {
      const primaryMethod = user.mfaMethods.find(m => m.isPrimary) || user.mfaMethods[0];
      const mfaChallenge = await this.createMFAChallenge(
        user.id,
        session.id,
        primaryMethod.type
      );

      return { requiresMFA: true, mfaChallenge };
    }

    return { requiresMFA: false };
  }

  private async verifyAgentToken(token: string): Promise<EnhancedUser | null> {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      const agent = await this.databaseService.getUserById(decoded.userId);

      if (!agent || agent.userType !== UserType.AGENT) {
        return null;
      }

      return agent;
    } catch (error) {
      return null;
    }
  }

  private validateAgentCapabilities(agent: EnhancedUser, requestedCapabilities: AgentCapability[]): boolean {
    const agentCapabilities = agent.agentConfig?.capabilities || [];
    return requestedCapabilities.every(cap => agentCapabilities.includes(cap));
  }

  private async validateAgentProviderAccess(agentId: string, providerType: OAuthProviderType): Promise<boolean> {
    const connection = await this.oauthProviderService.getAgentConnection(agentId, providerType);
    return connection !== null;
  }

  private isLocationTrusted(user: EnhancedUser, session: Session): boolean {
    return false; // TODO: Implement location trust logic
  }

  private async getAgentConnectedProviders(agentId: string): Promise<any[]> {
    return []; // TODO: Get connected OAuth providers for agent
  }

  private generateSessionToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private verifyTOTPResponse(response: string, challenge: string): boolean {
    // TODO: Implement TOTP verification using speakeasy
    return response === challenge;
  }

  private async encryptChallenge(challenge: string): Promise<string> {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(config.security?.encryptionKey || 'default-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(challenge, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  private async decryptChallenge(encryptedChallenge: string): Promise<string> {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(config.security?.encryptionKey || 'default-key', 'salt', 32);

    const [ivHex, encrypted] = encryptedChallenge.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  private async sendMFAChallenge(user: EnhancedUser, challenge: MFAChallenge, code: string): Promise<void> {
    // Implement MFA challenge sending logic (SMS, email, etc.)
    // This is a placeholder
  }
} 