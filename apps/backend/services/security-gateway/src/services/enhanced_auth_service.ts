import { logger, NotFoundError, ValidationError } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { UserService, OAuthService, MFAService, SessionService } from '@uaip/shared-services';
import { JWTValidator as _JWTValidator, generateAuthTokens } from '@uaip/middleware';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import {
  EnhancedUser,
  UserEntity,
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
  TokenPayload,
} from '@uaip/types';
import { OAuthProviderService } from './oauth_provider_service.js';
import { AuditService } from './audit_service.js';
import { config } from '@uaip/config';
import * as speakeasy from 'speakeasy';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isOAuthProviderType(v: unknown): v is OAuthProviderType {
  return typeof v === 'string' && (Object.values(OAuthProviderType) as string[]).includes(v);
}

function isAgentCapability(v: unknown): v is AgentCapability {
  return typeof v === 'string' && new Set<string>(Object.values(AgentCapability)).has(v);
}

function toEnhancedUser(entity: UserEntity): EnhancedUser {
  const agentConfig = entity.agentConfig ?? undefined;
  // Construct EnhancedUser explicitly: UserEntity uses null for optional DB columns,
  // but EnhancedUser (Zod-inferred) uses undefined. Map null→undefined throughout.
  return {
    id: entity.id,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    email: entity.email,
    // UserEntity has no `name` column; derive from firstName/lastName or fall back to email
    name: `${entity.firstName ?? ''} ${entity.lastName ?? ''}`.trim() || entity.email,
    role: entity.role,
    userType: entity.userType,
    passwordHash: entity.passwordHash,
    securityClearance: entity.securityClearance,
    isActive: entity.isActive,
    firstName: entity.firstName ?? undefined,
    lastName: entity.lastName ?? undefined,
    department: entity.department ?? undefined,
    failedLoginAttempts: entity.failedLoginAttempts,
    lockedUntil: entity.lockedUntil ?? undefined,
    passwordChangedAt: entity.passwordChangedAt ?? undefined,
    lastLoginAt: entity.lastLoginAt ?? undefined,
    agentConfig: agentConfig
      ? {
          capabilities: (agentConfig.capabilities ?? []).filter(isAgentCapability),
          maxConcurrentSessions: agentConfig.maxConcurrentSessions ?? 5,
          allowedProviders: (agentConfig.allowedProviders ?? []).filter(isOAuthProviderType),
          securityLevel: agentConfig.securityLevel ?? SecurityLevel.MEDIUM,
          monitoring: {
            logLevel:
              (agentConfig.monitoring?.logLevel as
                | 'minimal'
                | 'standard'
                | 'detailed'
                | 'verbose'
                | undefined) ?? 'standard',
            alertOnNewProvider:
              typeof agentConfig.monitoring?.alertOnNewProvider === 'boolean'
                ? agentConfig.monitoring.alertOnNewProvider
                : true,
            alertOnUnusualActivity:
              typeof agentConfig.monitoring?.alertOnUnusualActivity === 'boolean'
                ? agentConfig.monitoring.alertOnUnusualActivity
                : true,
            ...(typeof agentConfig.monitoring?.maxDailyOperations === 'number'
              ? { maxDailyOperations: agentConfig.monitoring.maxDailyOperations }
              : {}),
          },
        }
      : undefined,
    oauthProviders: [],
    mfaEnabled: false,
    mfaMethods: [],
    securityPreferences: {
      requireMFAForSensitiveOperations: true,
      sessionTimeout: 3600,
      allowMultipleSessions: true,
      trustedDevices: [],
      securityNotifications: {
        newDevice: true,
        suspiciousActivity: true,
        passwordChange: true,
        mfaChange: true,
        oauthProviderChange: true,
        agentActivityAlerts: true,
      },
    },
  };
}

function isMFAMethod(v: unknown): v is MFAMethod {
  return typeof v === 'string' && new Set<string>(Object.values(MFAMethod)).has(v);
}

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

type PermissionEntry = string | { resource?: string; [key: string]: unknown };

type OAuthServiceExtended = {
  getAgentConnection: (agentId: string, providerType: OAuthProviderType) => Promise<unknown>;
};

const CIPHER_GCM_TYPES = ['aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm', 'chacha20-poly1305'] as const;

function isCipherGCMType(v: string): v is crypto.CipherGCMTypes {
  return (CIPHER_GCM_TYPES as readonly string[]).includes(v);
}

function isOAuthServiceExtended(v: unknown): v is OAuthServiceExtended {
  return (
    typeof v === 'object' &&
    v !== null &&
    'getAgentConnection' in v &&
    typeof v.getAgentConnection === 'function'
  );
}

// Type for connected providers in agent security context
type AgentConnectedProvider = {
  providerId: string;
  providerType: OAuthProviderType;
  capabilities: AgentCapability[];
  lastUsed?: Date;
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
      let user: EnhancedUser | null = null;
      // Guard: only search by email if email is present
      if (userInfo.email) {
        const foundByEmail = await this.userService.findUserByEmail(userInfo.email);
        if (foundByEmail) {
          user = toEnhancedUser(foundByEmail);
        }
      }

      if (!user) {
        // Check if there's an OAuth connection for this provider
        // Guard: both userInfo.id and provider.id must be present
        if (userInfo.id && provider.id) {
          const oauthConnection = await this.oauthDomainService.findAgentOAuthConnection(
            userInfo.id,
            provider.id
          );
          if (oauthConnection) {
            // oauthConnection.agentId may be undefined — fail closed if missing
            if (!oauthConnection.agentId) {
              throw new ApiError(401, 'OAuth connection has no associated user', 'INVALID_OAUTH_CONNECTION');
            }
            const foundById = await this.userService.findUserById(oauthConnection.agentId);
            if (foundById) {
              user = toEnhancedUser(foundById);
            }
          }
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

      // Check provider access — agent.id must be present (fail closed)
      if (!agent.id) {
        throw new ApiError(401, 'Agent has no ID', 'INVALID_AGENT');
      }
      const providerAccessResults = await Promise.all(
        request.requestedProviders.map(async (providerType) => ({
          providerType,
          hasAccess: await this.validateAgentProviderAccess(agent.id!, providerType),
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
        if (!provider.id) {
          throw new ApiError(400, 'OAuth provider has no ID', 'INVALID_PROVIDER');
        }
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
        const enhancedUser = toEnhancedUser(user);
        await this.updateUserOAuthConnection(enhancedUser, tokens, provider, userInfo);

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
  ): Promise<{ verified: boolean; session?: Record<string, unknown> | null }> {
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

      const challengeType = isMFAMethod(challenge.challengeType) ? challenge.challengeType : null;
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

        return { verified: true, session: session as Record<string, unknown> | null };
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

      // Fail closed: session must have a userId to look up the user
      if (!session.userId) {
        throw new ApiError(401, 'Session has no associated user', 'INVALID_SESSION');
      }

      const rawUser = await this.userService.findUserById(session.userId);
      if (!rawUser) {
        throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
      }
      const user = toEnhancedUser(rawUser);

      // Get user permissions - for now, derive from role
      if (!user.role) {
        throw new ApiError(401, 'User has no role assigned', 'INVALID_USER');
      }
      const permissions = this.getUserPermissionsFromRole(user.role);

      // Determine device trust: cast deviceInfo to unknown first to safely check isTrusted
      const rawDeviceInfo: unknown = session.deviceInfo;
      const deviceTrusted =
        isRecord(rawDeviceInfo) && typeof rawDeviceInfo['isTrusted'] === 'boolean'
          ? rawDeviceInfo['isTrusted']
          : false;

      // Determine agent context — only for AGENT users with a valid ID
      let agentContext: EnhancedSecurityContext['agentContext'];
      if (user.userType === UserType.AGENT && user.id) {
        const agentId = user.id;
        agentContext = {
          agentId,
          agentName:
            user.name ||
            `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
            user.email,
          capabilities: (user.agentConfig?.capabilities || []).filter(
            (c): c is AgentCapability => new Set<string>(Object.values(AgentCapability)).has(c)
          ),
          connectedProviders: await this.getAgentConnectedProviders(agentId),
          operationLimits: {
            maxDailyOperations: user.agentConfig?.monitoring?.maxDailyOperations,
            currentDailyOperations: 0,
            maxConcurrentOperations: user.agentConfig?.maxConcurrentSessions || 5,
            currentConcurrentOperations: 0,
          },
        };
      }

      // Build enhanced security context
      const securityContext: EnhancedSecurityContext = {
        userId: user.id ?? '',
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
        deviceTrusted,
        locationTrusted: this.isLocationTrusted(user, session),
        agentContext,
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
    // OAuth-only signup: provision a brand-new account for a first-time OAuth login.
    const isAgent = oauthState.userType === UserType.AGENT;
    const email = userInfo.email || `${userInfo.id}@${provider.type ?? 'oauth'}.oauth`;

    // Derive first/last name from the provider's display name (e.g. "Jane Doe").
    const displayName = userInfo.name || userInfo.login || '';
    const [firstName, ...rest] = displayName.trim().split(/\s+/).filter(Boolean);
    const lastName = rest.join(' ') || undefined;

    // Persist through the shared UserService and return the DB-created row so the
    // caller's session/JWT/refresh-token are bound to the real (existing) user id.
    const created = await this.userService.createUser({
      email,
      firstName: firstName || undefined,
      lastName,
      role: isAgent ? 'agent' : 'user',
      isOAuthUser: true,
    });

    logger.info('Provisioned new user from OAuth login', {
      userId: created.id,
      email,
      provider: provider.type,
    });

    return toEnhancedUser(created);
  }

  private async updateUserOAuthConnection(
    user: EnhancedUser,
    tokens: OAuthTokensParam,
    provider: OAuthProviderParam,
    userInfo: OAuthUserInfoParam
  ): Promise<void> {
    // Guard: oauthProviders may be undefined on older EnhancedUser instances
    const oauthProviders = user.oauthProviders ?? [];
    const existingProvider = oauthProviders.find((p) => p.providerId === provider.id);

    if (existingProvider) {
      existingProvider.lastUsedAt = new Date();
      existingProvider.email = userInfo.email;
      existingProvider.displayName = userInfo.name || userInfo.login;
      existingProvider.avatarUrl = userInfo.avatar_url;
    } else {
      oauthProviders.push({
        providerId: provider.id ?? crypto.randomUUID(),
        providerType: provider.type ?? OAuthProviderType.GITHUB,
        providerUserId: userInfo.id ?? '',
        email: userInfo.email,
        displayName: userInfo.name || userInfo.login,
        avatarUrl: userInfo.avatar_url,
        isVerified: true,
        isPrimary: oauthProviders.length === 0,
        linkedAt: new Date(),
      });
    }

    // user.id may be undefined on Zod-inferred type; fail closed if missing
    if (!user.id) {
      throw new ApiError(500, 'Cannot update OAuth connection: user has no ID', 'INVALID_USER');
    }
    await this.userService.updateUser(user.id, user);
  }

  private async createSession(
    user: EnhancedUser,
    authMethod: AuthenticationMethod,
    oauthProvider?: OAuthProviderType,
    ipAddress?: string,
    userAgent?: string,
    agentCapabilities?: AgentCapability[]
  ): Promise<Session> {
    const sessionToken = this.generateSessionToken();

    const created = await this.sessionService.createSession(user.id ?? '', sessionToken, {
      agentCapabilities,
    });

    // Map DB session entity to Session type:
    // - DB uses null for optional columns; Session (Zod) uses undefined
    // - DB riskScore is decimal string; Session expects number
    // - deviceInfo shapes differ; omit it (not set during creation)
    const session: Session = {
      id: created.id,
      userId: created.userId,
      sessionToken: created.sessionToken,
      refreshToken: created.refreshToken ?? undefined,
      status: created.status,
      userType: created.userType,
      ipAddress: created.ipAddress ?? undefined,
      userAgent: created.userAgent ?? undefined,
      authenticationMethod: created.authenticationMethod,
      oauthProvider: created.oauthProvider ?? undefined,
      agentCapabilities: created.agentCapabilities ?? undefined,
      mfaVerified: created.mfaVerified,
      riskScore: Number(created.riskScore),
      expiresAt: created.expiresAt,
      lastActivityAt: created.lastActivityAt,
      metadata: created.metadata ?? undefined,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
    return session;
  }

  private async generateJWTTokens(
    user: EnhancedUser,
    session: Session
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Fail closed: all required JWT fields must be present
    if (!user.id || !user.email || !user.role || !session.id) {
      throw new ApiError(
        401,
        'Cannot generate tokens: missing required user or session fields',
        'MISSING_REQUIRED_FIELDS'
      );
    }

    const payload: TokenPayload = {
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      role: user.role,
      organizationId: (user as { organizationId?: string }).organizationId ?? '00000000-0000-0000-0000-000000000001',
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
      // Fail closed: both user.id and session.id must be present to create MFA challenge
      if (!user.id || !session.id) {
        throw new ApiError(
          401,
          'Cannot create MFA challenge: missing user or session ID',
          'INVALID_CONTEXT'
        );
      }
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
      if (!decoded || typeof decoded === 'string') {
        return null;
      }
      if (typeof decoded['userId'] !== 'string') {
        return null;
      }
      const userId = decoded['userId'];
      const agent = await this.userService.findUserById(userId);
      if (!agent || agent.userType !== UserType.AGENT) {
        return null;
      }

      return toEnhancedUser(agent);
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
    const oauthSvc: unknown = this.oauthProviderService;
    if (isOAuthServiceExtended(oauthSvc)) {
      const connection = await oauthSvc.getAgentConnection(agentId, providerType);
      return connection !== null;
    }
    // Fallback: check through database — Drizzle AgentOAuthConnection has no providerType/isActive;
    // check for any non-expired connection (provider matching is done at the service level)
    const providers = await this.oauthDomainService.findAgentOAuthConnections(agentId);
    return providers.some((p) => !p.expiresAt || p.expiresAt > new Date());
  }

  private isLocationTrusted(
    user: Pick<EnhancedUser, 'securityPreferences'>,
    session: { ipAddress: string | null | undefined }
  ): boolean {
    if (!session.ipAddress) return false;
    const trustedDevices = user.securityPreferences?.trustedDevices ?? [];
    const now = new Date();
    return trustedDevices.some(
      (device) =>
        device.ipAddress === session.ipAddress && (!device.expiresAt || device.expiresAt > now)
    );
  }

  private async getAgentConnectedProviders(agentId: string): Promise<AgentConnectedProvider[]> {
    try {
      // Return empty array — raw connections from OAuth service are untyped (unknown[])
      // and cannot be safely cast to AgentConnectedProvider without runtime validation.
      // Callers treat this as informational; empty is the safe default.
      void await this.oauthProviderService.getAgentConnections(agentId);
      return [];
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
    const rawAlg = config.security.encryptionAlgorithm;
    if (!isCipherGCMType(rawAlg)) {
      throw new Error(`Unsupported cipher algorithm: ${rawAlg}`);
    }
    const algorithm = rawAlg;
    const salt = crypto.randomBytes(16);
    if (salt.length < 16) {
      throw new Error('Salt must be at least 16 bytes');
    }
    const key = crypto.scryptSync(config.security.encryptionKey, salt, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(challenge, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();
    return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private async decryptChallenge(encryptedChallenge: string): Promise<string> {
    const rawAlg = config.security.encryptionAlgorithm;
    if (!isCipherGCMType(rawAlg)) {
      throw new Error(`Unsupported cipher algorithm: ${rawAlg}`);
    }
    const algorithm = rawAlg;
    const parts = encryptedChallenge.split(':');

    if (parts.length === 4) {
      // Current format: salt:iv:authTag:encrypted (per-record random salt)
      const [saltHex, ivHex, authTagHex, encrypted] = parts;
      const salt = Buffer.from(saltHex, 'hex');
      const key = crypto.scryptSync(config.security.encryptionKey, salt, 32);
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    // Legacy format: iv:encrypted (static salt, no auth tag)
    const legacyKey = crypto.scryptSync(config.security.encryptionKey, 'salt', 32);
    const [ivHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, legacyKey, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    logger.warn('Decrypted challenge using legacy static-salt format without auth tag — re-encrypt recommended');
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
