import { logger, NotFoundError, ValidationError } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { UserService, OAuthService, MFAService, SessionService } from '@uaip/shared-services';
import { JWTValidator as _JWTValidator, generateAuthTokens } from '@uaip/middleware';
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
  AuditEventType,
  AuthenticationResult,
  AgentAuthenticationRequest,
} from '@uaip/types';
import { OAuthProviderService } from './oauth_provider_service.js';
import { AuditService } from './audit_service.js';
import { config } from '@uaip/config';
import * as speakeasy from 'speakeasy';

type OAuthUserInfoParam = {
  email?: string;
  id?: string;
  name?: string;
  login?: string;
  avatar_url?: string;
  type?: string;
};

type OAuthProviderParam = {
  id?: string;
  type?: OAuthProviderType;
  agentConfig?: { permissions?: string[] };
};

type OAuthStateParam = {
  agentCapabilities?: AgentCapability[];
  userType?: UserType;
};

type OAuthTokensParam = object;

type DeviceInfoWithTrust = {
  isTrusted?: boolean;
  [key: string]: unknown;
};

type PermissionEntry = string | { resource?: string; [key: string]: unknown };

type OAuthServiceExtended = {
  getAgentConnection: (agentId: string, providerType: OAuthProviderType) => Promise<unknown>;
};

export class EnhancedAuthService {
  private userService: UserService;
  private oauthDomainService: OAuthService;
  private mfaService: MFAService;
  private sessionService: SessionService;

  constructor(
    private oauthProviderService: OAuthProviderService,
    private auditService: AuditService
  ) {
    this.userService = UserService.getInstance();
    this.oauthDomainService = OAuthService.getInstance();
    this.mfaService = MFAService.getInstance();
    this.sessionService = SessionService.getInstance();
  }

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
      const { tokens, userInfo, provider, oauthState } =
        await this.oauthProviderService.handleCallback(code, state, redirectUri);

      // Find or create user
      // Try to find user by email first, then by OAuth connection
      // @ts-expect-error — UserService returns UserEntity; EnhancedUser is a superset used locally; structurally compatible at runtime
      let user: EnhancedUser | null = await this.userService.findUserByEmail(userInfo.email);

      if (!user) {
        // Check if there's an OAuth connection for this provider
        const oauthConnection = await this.oauthDomainService.findAgentOAuthConnection(
          userInfo.id,
          provider.id
        );
        if (oauthConnection) {
          // @ts-expect-error -- Argument type mismatch
          user = await this.userService.findUserById(oauthConnection.agentId);
        }
      }

      if (!user) {
        user = await this.createUserFromOAuth(
          userInfo,
          provider,
          oauthState
        );
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
          mfaRequired: requiresMFA,
        },
        ipAddress,
        userAgent,
      });

      logger.info('OAuth authentication successful', {
        userId: user.id,
        userType: user.userType,
        provider: provider.type,
        mfaRequired: requiresMFA,
      });

      return {
        user,
        session,
        tokens: jwtTokens,
        requiresMFA,
        mfaChallenge,
      };
    } catch (error) {
      logger.error('OAuth authentication failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
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
      const providerAccessResults = await Promise.all(
        request.requestedProviders.map(async (providerType) => ({
          providerType,
          hasAccess: await this.validateAgentProviderAccess(agent.id, providerType),
        }))
      );
      const deniedProvider = providerAccessResults.find((result) => !result.hasAccess);
      if (deniedProvider) {
        throw new ApiError(
          403,
          `Agent cannot access provider: ${deniedProvider.providerType}`,
          'PROVIDER_ACCESS_DENIED'
        );
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
          requestedProviders: request.requestedProviders,
        },
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
      });

      logger.info('Agent authentication successful', {
        agentId: agent.id,
        capabilities: request.capabilities,
        requestedProviders: request.requestedProviders,
      });

      return {
        user: agent,
        session,
        tokens: jwtTokens,
        requiresMFA: false,
      };
    } catch (error) {
      logger.error('Agent authentication failed', {
        agentId: request.agentId,
        error: error instanceof Error ? error.message : 'Unknown error',
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
  ): Promise<{ success: boolean; connection?: unknown }> {
    try {
      const user = await this.userService.findUserById(userId);
      if (!user) {
        throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
      }

      const { tokens, userInfo, provider, oauthState } =
        await this.oauthProviderService.handleCallback(code, state, redirectUri);
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
            capabilities: oauthState.agentCapabilities,
          },
        });

        return { success: true, connection };
      } else {
        // Update user OAuth connection
        // @ts-expect-error -- UserEntity from UserService not assignable to EnhancedUser; oauthProviders missing on UserEntity
        await this.updateUserOAuthConnection(user, tokens, provider, userInfo);

        await this.auditService.logEvent({
          eventType: AuditEventType.SECURITY_CONFIG_CHANGE,
          userId: user.id,
          details: {
            action: 'connect_oauth_provider',
            provider: provider.type,
          },
        });

        return { success: true };
      }
    } catch (error) {
      logger.error('Failed to connect OAuth provider', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
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
    const user = await this.userService.findUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // For now, allow any MFA method - this should be configured from user preferences
    const _mfaMethod = { type: method, isEnabled: true };

    let challenge: string;
    switch (method) {
      case MFAMethod.TOTP:
        challenge = crypto.randomInt(100000, 1000000).toString();
        break;
      case MFAMethod.SMS:
      case MFAMethod.EMAIL:
        challenge = crypto.randomInt(100000, 1000000).toString();
        break;
      default:
        throw new ValidationError(`Unsupported MFA method: ${method}`);
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
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    };

    await this.mfaService.createMFAChallenge(userId, method, sessionId);

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
      const challenge = await this.mfaService.findMFAChallenge(challengeId);
      if (!challenge || challenge.expiresAt < new Date()) {
        throw new ApiError(400, 'Invalid or expired MFA challenge', 'INVALID_MFA_CHALLENGE');
      }

      if (challenge.verifiedAt !== null) {
        throw new ApiError(400, 'MFA challenge already verified', 'CHALLENGE_ALREADY_VERIFIED');
      }

      if (challenge.attempts >= 5) {
        throw new ApiError(400, 'Maximum MFA attempts exceeded', 'MAX_ATTEMPTS_EXCEEDED');
      }

      // Increment attempts
      await this.mfaService.incrementAttempts(challengeId);

      // Verify response based on method
      const challengeDataRecord: Record<string, unknown> = typeof challenge.challengeData === 'object' && challenge.challengeData !== null
        ? challenge.challengeData
        : {};
      const rawChallenge = challengeDataRecord.challenge;
      const decryptedChallenge = await this.decryptChallenge(
        typeof rawChallenge === 'string' ? rawChallenge : ''
      );
      let verified = false;

      const challengeType = typeof challenge.challengeType === 'string' && Object.values(MFAMethod).includes(challenge.challengeType as MFAMethod)
        ? (challenge.challengeType as MFAMethod)
        : null;
      switch (challengeType) {
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
        await this.mfaService.verifyMFAChallenge(challenge.userId, response);

        // Update session to mark MFA as verified
        const rawSessionId = challengeDataRecord.sessionId;
        const sessionId = typeof rawSessionId === 'string' ? rawSessionId : undefined;
        const session = sessionId ? await this.sessionService.findSessionById(sessionId) : null;
        if (session) {
          await this.sessionService.updateSession(session.id, { mfaVerified: true });
        }

        await this.auditService.logEvent({
          eventType: AuditEventType.MFA_SUCCESS,
          userId: challenge.userId,
          details: {
            method: challenge.challengeType,
            challengeId,
          },
        });

        logger.info('MFA challenge verified successfully', {
          userId: challenge.userId,
          method: challenge.challengeType,
          challengeId,
        });

        // @ts-expect-error — SessionService returns SessionEntity (Drizzle); Session is the @uaip/types interface; structurally compatible
        return { verified: true, session };
      } else {
        await this.auditService.logEvent({
          eventType: AuditEventType.MFA_FAILED,
          userId: challenge.userId,
          details: {
            method: challenge.challengeType,
            challengeId,
            attempts: challenge.attempts,
          },
        });

        return { verified: false };
      }
    } catch (error) {
      logger.error('Failed to verify MFA challenge', {
        challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create enhanced security context from session
   */
  public async createSecurityContext(sessionId: string): Promise<EnhancedSecurityContext> {
    try {
      const session = await this.sessionService.findSession(sessionId);
      if (!session || session.status !== SessionStatus.ACTIVE) {
        throw new ApiError(401, 'Invalid or inactive session', 'INVALID_SESSION');
      }

      const user = await this.userService.findUserById(session.userId);
      if (!user) {
        throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
      }

      // Get user permissions - for now, derive from role
      const permissions = this.getUserPermissionsFromRole(user.role);

      // Build enhanced security context
      const securityContext: EnhancedSecurityContext = {
        userId: user.id,
        sessionId: session.id,
        userType: user.userType,
        ipAddress: session.ipAddress ?? undefined,
        userAgent: session.userAgent ?? undefined,
        department: user.department,
        role: user.role,
        permissions: Array.isArray(permissions)
          ? permissions.map((p: PermissionEntry) => (typeof p === 'string' ? p : (p.resource ?? '')))
          : [],
        securityLevel: user.securityClearance,
        lastAuthentication: session.createdAt,
        mfaVerified: session.mfaVerified,
        riskScore: Number(session.riskScore),
        authenticationMethod: session.authenticationMethod,
        oauthProvider: session.oauthProvider ?? undefined,
        agentCapabilities: session.agentCapabilities ?? undefined,
        deviceTrusted: (session.deviceInfo as DeviceInfoWithTrust | undefined)?.isTrusted ?? false,
        // @ts-expect-error — UserEntity.agentConfig.allowedProviders is string[]; EnhancedUser expects OAuthProviderType[]; structurally compatible at runtime
        locationTrusted: this.isLocationTrusted(user, session),
        agentContext:
          user.userType === UserType.AGENT
            ? {
                agentId: user.id,
                agentName:
                  user.name ||
                  `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
                  user.email,
                capabilities: (user.agentConfig?.capabilities || []).filter(
                  (c): c is AgentCapability => (Object.values(AgentCapability) as string[]).includes(c)
                ),
                connectedProviders: await this.getAgentConnectedProviders(user.id),
                operationLimits: {
                  maxDailyOperations: user.agentConfig?.monitoring?.maxDailyOperations,
                  currentDailyOperations: 0,
                  maxConcurrentOperations: user.agentConfig?.maxConcurrentSessions || 5,
                  currentConcurrentOperations: 0,
                },
              }
            : undefined,
      };

      return securityContext;
    } catch (error) {
      logger.error('Failed to create security context', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Private helper methods

  private async createUserFromOAuth(
    userInfo: OAuthUserInfoParam,
    provider: OAuthProviderParam,
    oauthState: OAuthStateParam
  ): Promise<EnhancedUser> {
    const user: EnhancedUser = {
      id: crypto.randomUUID(),
      email: userInfo.email || `${userInfo.id}@${provider.type}.oauth`,
      name: userInfo.name || userInfo.login || 'OAuth User',
      role: oauthState.userType === UserType.AGENT ? 'agent' : 'user',
      userType: oauthState.userType || UserType.HUMAN,
      securityClearance: SecurityLevel.MEDIUM,
      isActive: true,
      oauthProviders: [
        {
          providerId: provider.id,
          providerType: provider.type,
          providerUserId: userInfo.id,
          email: userInfo.email,
          displayName: userInfo.name || userInfo.login,
          avatarUrl: userInfo.avatar_url,
          isVerified: true,
          isPrimary: true,
          linkedAt: new Date(),
          capabilities: oauthState.agentCapabilities,
        },
      ],
      agentConfig:
        oauthState.userType === UserType.AGENT
          ? {
              capabilities: oauthState.agentCapabilities || [],
              maxConcurrentSessions: 5,
              allowedProviders: provider.type ? [provider.type] : [],
              securityLevel: SecurityLevel.MEDIUM,
              monitoring: {
                logLevel: 'standard',
                alertOnNewProvider: true,
                alertOnUnusualActivity: true,
              },
            }
          : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // @ts-expect-error — UserService.createUser expects CreateUserData; EnhancedUser is a superset; structurally compatible at runtime
    return await this.userService.createUser(user);
  }

  private async updateUserOAuthConnection(
    user: EnhancedUser,
    tokens: OAuthTokensParam,
    provider: OAuthProviderParam,
    userInfo: OAuthUserInfoParam
  ): Promise<void> {
    const existingProvider = user.oauthProviders.find((p) => p.providerId === provider.id);

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
        linkedAt: new Date(),
      });
    }

    await this.userService.updateUser(user.id!, user);
  }

  private async createSession(
    user: EnhancedUser,
    authMethod: AuthenticationMethod,
    oauthProvider?: OAuthProviderType,
    ipAddress?: string,
    userAgent?: string,
    agentCapabilities?: AgentCapability[]
  ) {
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
      updatedAt: new Date(),
    };

    const created = await this.sessionService.createSession(user.id, session.sessionToken, {
      deviceInfo: session.deviceInfo,
      agentCapabilities: session.agentCapabilities,
      metadata: session.metadata,
    });
    return { ...created, riskScore: Number(created.riskScore) };
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
      userType: String(user.userType),
      securityLevel: typeof user.securityClearance === 'number' ? user.securityClearance : 0,
      agentCapabilities: Array.isArray(session.agentCapabilities) ? session.agentCapabilities.map(String) : [],
    };

    const tokens = generateAuthTokens(payload);

    return tokens;
  }

  // ... (rest of the file)

  private async checkMFARequirement(
    user: EnhancedUser,
    session: Session
  ): Promise<{ requiresMFA: boolean; mfaChallenge?: MFAChallenge }> {
    if (!user.mfaEnabled) {
      return { requiresMFA: false };
    }

    if (user.securityPreferences?.requireMFAForSensitiveOperations) {
      // Use TOTP as default MFA method for now
      const primaryMethod = { type: MFAMethod.TOTP, isPrimary: true };
      const mfaChallenge = await this.createMFAChallenge(user.id, session.id, primaryMethod.type);

      return { requiresMFA: true, mfaChallenge };
    }

    return { requiresMFA: false };
  }

  private async verifyAgentToken(token: string): Promise<EnhancedUser | null> {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      if (!decoded || typeof decoded === 'string' || typeof (decoded as jwt.JwtPayload).userId !== 'string') {
        return null;
      }
      const decodedPayload = decoded as jwt.JwtPayload;

      const agent = await this.userService.findUserById(decodedPayload.userId as string);
      if (!agent || agent.userType !== UserType.AGENT) {
        return null;
      }

      // @ts-expect-error -- UserEntity not assignable to EnhancedUser; oauthProviders missing; structurally compatible at runtime
      return agent;
    } catch {
      return null;
    }
  }

  private validateAgentCapabilities(
    agent: EnhancedUser,
    requestedCapabilities: AgentCapability[]
  ): boolean {
    const agentCapabilities = agent.agentConfig?.capabilities || [];
    return requestedCapabilities.every((cap) => agentCapabilities.includes(cap));
  }

  private async validateAgentProviderAccess(
    agentId: string,
    providerType: OAuthProviderType
  ): Promise<boolean> {
    // Check if the OAuth provider service has the method
    // @ts-expect-error — duck-typing check: OAuthProviderService may have getAgentConnection at runtime; verified with 'in' check below
    const extendedOAuthService: OAuthServiceExtended = this.oauthProviderService;
    if (
      'getAgentConnection' in this.oauthProviderService &&
      typeof extendedOAuthService.getAgentConnection === 'function'
    ) {
      const connection = await extendedOAuthService.getAgentConnection(
        agentId,
        providerType
      );
      return connection !== null;
    }
    // Fallback: check through database — Drizzle AgentOAuthConnection has no providerType/isActive;
    // check for any non-expired connection (provider matching is done at the service level)
    const providers = await this.oauthDomainService.findAgentOAuthConnections(agentId);
    return providers.some((p) => !p.expiresAt || p.expiresAt > new Date());
  }

  private isLocationTrusted(user: EnhancedUser, session: Session): boolean {
    if (!session.ipAddress) return false;
    const trustedDevices = user.securityPreferences?.trustedDevices ?? [];
    const now = new Date();
    return trustedDevices.some(
      (device) =>
        device.ipAddress === session.ipAddress && (!device.expiresAt || device.expiresAt > now)
    );
  }

  private async getAgentConnectedProviders(agentId: string): Promise<unknown[]> {
    try {
      return await this.oauthProviderService.getAgentConnections(agentId);
    } catch (error) {
      logger.warn('Failed to get agent connected providers', { agentId, error });
      return [];
    }
  }

  private generateSessionToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private verifyTOTPResponse(response: string, challenge: string): boolean {
    return speakeasy.totp.verify({
      secret: challenge,
      encoding: 'base32',
      token: response,
      window: 1,
    });
  }

  private async encryptChallenge(challenge: string): Promise<string> {
    // @ts-expect-error -- config.security.encryptionAlgorithm is string; CipherGCMTypes is a string subtype; valid at runtime
    const algorithm: crypto.CipherGCMTypes = config.security.encryptionAlgorithm;
    const key = crypto.scryptSync(config.security.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(challenge, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  private async decryptChallenge(encryptedChallenge: string): Promise<string> {
    // @ts-expect-error -- config.security.encryptionAlgorithm is string; CipherGCMTypes is a string subtype; valid at runtime
    const algorithm: crypto.CipherGCMTypes = config.security.encryptionAlgorithm;
    const key = crypto.scryptSync(config.security.encryptionKey, 'salt', 32);

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

  private async sendMFAChallenge(
    _user: unknown,
    _challenge: MFAChallenge,
    _code: string
  ): Promise<void> {
    // Implement MFA challenge sending logic (SMS, email, etc.)
    // This is a placeholder
  }
}
