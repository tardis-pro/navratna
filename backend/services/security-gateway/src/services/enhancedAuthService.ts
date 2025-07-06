import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { DatabaseService } from '@uaip/shared-services';
import { JWTValidator } from '@uaip/middleware';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
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
import * as speakeasy from 'speakeasy';

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
      // Try to find user by email first, then by OAuth connection
      let user = await this.databaseService.users.findUserByEmail(userInfo.email);
      
      if (!user) {
        // Check if there's an OAuth connection for this provider
        const oauthConnection = await this.databaseService.oauth.findAgentOAuthConnection(
          userInfo.id,
          provider.id
        );
        if (oauthConnection) {
          user = await this.databaseService.users.findUserById(oauthConnection.agentId);
        }
      }

      if (!user) {
        user = await this.createUserFromOAuth(userInfo, provider, oauthState) as any;
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
          userType: (user as any).userType || UserType.HUMAN,
          mfaRequired: requiresMFA
        },
        ipAddress,
        userAgent
      });

      logger.info('OAuth authentication successful', {
        userId: user.id,
        userType: (user as any).userType || UserType.HUMAN,
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
      const user = await this.databaseService.users.findUserById(userId);
      if (!user) {
        throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
      }

      const { tokens, userInfo, provider, oauthState } = await this.oauthProviderService.handleCallback(
        code,
        state,
        redirectUri
      );

      if (((user as any).userType || UserType.HUMAN) === UserType.AGENT && oauthState.agentCapabilities) {
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
    const user = await this.databaseService.users.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // For now, allow any MFA method - this should be configured from user preferences
    const mfaMethod = { type: method, isEnabled: true };

    let challenge: string;
    switch (method) {
      case MFAMethod.TOTP:
        // Generate TOTP challenge - simplified for now
        challenge = Math.floor(100000 + Math.random() * 900000).toString();
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

    await this.databaseService.mfa.createMFAChallenge(userId, method, sessionId);

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
      const challenge = await this.databaseService.mfa.findMFAChallenge(challengeId);
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
      await this.databaseService.mfa.incrementAttempts(challengeId);

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
        // Mark challenge as verified using the MFA service verify method
        await this.databaseService.mfa.verifyMFAChallenge(challenge.userId, response);

        // Update session to mark MFA as verified
        const session = await this.databaseService.sessions.findSession(challenge.sessionId);
        if (session) {
          session.mfaVerified = true;
          await this.databaseService.sessions.updateSession(session.id, session);
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
      const session = await this.databaseService.sessions.findSession(sessionId);
      if (!session || session.status !== SessionStatus.ACTIVE) {
        throw new ApiError(401, 'Invalid or inactive session', 'INVALID_SESSION');
      }

      const user = await this.databaseService.users.findUserById(session.userId);
      if (!user) {
        throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
      }

      // Get user permissions - for now, derive from role
      const permissions = this.getUserPermissionsFromRole(user.role);

      // Build enhanced security context
      const securityContext: EnhancedSecurityContext = {
        userId: user.id,
        sessionId: session.id,
        userType: (user as any).userType || UserType.HUMAN,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        department: user.department,
        role: user.role,
        permissions: Array.isArray(permissions) ? permissions.map((p: any) => p.resource || p) : [],
        securityLevel: user.securityClearance,
        lastAuthentication: session.createdAt,
        mfaVerified: session.mfaVerified,
        riskScore: session.riskScore,
        authenticationMethod: session.authenticationMethod,
        oauthProvider: session.oauthProvider,
        agentCapabilities: session.agentCapabilities,
        deviceTrusted: (session.deviceInfo as any)?.isTrusted || false,
        locationTrusted: this.isLocationTrusted(user, session),
        agentContext: ((user as any).userType || UserType.HUMAN) === UserType.AGENT ? {
          agentId: user.id,
          agentName: (user as any).name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          capabilities: (user as any).agentConfig?.capabilities || [],
          connectedProviders: await this.getAgentConnectedProviders(user.id),
          operationLimits: {
            maxDailyOperations: (user as any).agentConfig?.monitoring?.maxDailyOperations,
            currentDailyOperations: 0,
            maxConcurrentOperations: (user as any).agentConfig?.maxConcurrentSessions || 5,
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

    return await this.databaseService.users.createUser(user as any);
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

    await this.databaseService.users.updateUser(user.id!, user as any);
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

    return await this.databaseService.sessions.createSession(user.id, session.sessionToken, {
      deviceInfo: session.deviceInfo,
      agentCapabilities: session.agentCapabilities,
      metadata: session.metadata
    });
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

    const jwtValidator = JWTValidator.getInstance();
    const accessToken = jwtValidator.sign(payload);
    const refreshToken = jwtValidator.signRefreshToken(payload);

    return { accessToken, refreshToken };
  }

// ... (rest of the file)


  private async checkMFARequirement(
    user: EnhancedUser,
    session: Session
  ): Promise<{ requiresMFA: boolean; mfaChallenge?: MFAChallenge }> {
    if (!(user as any).mfaEnabled) {
      return { requiresMFA: false };
    }

    if (user.securityPreferences?.requireMFAForSensitiveOperations) {
      // Use TOTP as default MFA method for now
      const primaryMethod = { type: MFAMethod.TOTP, isPrimary: true };
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
      const agent = await this.databaseService.users.findUserById(decoded.userId);

      if (!agent || ((agent as any).userType || UserType.HUMAN) !== UserType.AGENT) {
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
    const connection = await (this.oauthProviderService as any).getAgentConnection(agentId, providerType);
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
    const key = crypto.scryptSync((config as any).security?.encryptionKey || 'default-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(challenge, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  private async decryptChallenge(encryptedChallenge: string): Promise<string> {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync((config as any).security?.encryptionKey || 'default-key', 'salt', 32);

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

  private getUserPermissionsFromRole(role: string): string[] {
    switch (role) {
      case 'admin':
        return ['read', 'write', 'delete', 'admin', 'manage_users', 'manage_agents'];
      case 'operator':
        return ['read', 'write', 'manage_agents'];
      case 'viewer':
        return ['read'];
      default:
        return ['read'];
    }
  }

  private async sendMFAChallenge(user: EnhancedUser, challenge: MFAChallenge, code: string): Promise<void> {
    // Implement MFA challenge sending logic (SMS, email, etc.)
    // This is a placeholder
  }
} 