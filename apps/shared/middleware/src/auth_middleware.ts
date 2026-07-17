import { Elysia, type AnyElysia } from 'elysia';
import jwt from 'jsonwebtoken';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import type { AuthContext, RequiredAuthContext, UserContext } from '@uaip/types';
import { JWTValidator } from './j_w_t_validator.js';

const ADMIN_ORG_ID = '00000000-0000-0000-0000-000000000001';

export type { UserContext };

// Context type for Elysia route handlers where withRequiredAuth has been applied
export type AuthedContext = RequiredAuthContext;

// Context type for Elysia route handlers where withOptionalAuth has been applied
export type OptionalAuthContext = AuthContext;

type ContextWithOptionalUser = { user?: UserContext | null; set: { status?: number | string }; [key: string]: unknown };

const hasUserContext = (
  context: ContextWithOptionalUser
): context is { user: UserContext; set: { status: number | string }; [key: string]: unknown } => context.user != null;

const getValidatedUserContext = (context: ContextWithOptionalUser): UserContext | null => {
  if (!hasUserContext(context)) {
    return null;
  }

  return context.user;
};

function getAuthenticatedUser(
  context: ContextWithOptionalUser
): UserContext | { error: string; code: string } {
  const user = getValidatedUserContext(context);
  if (!user) {
    context.set.status = 401;
    return { error: 'Authentication required', code: 'AUTH_REQUIRED' };
  }
  return user;
}

function isAuthError(v: UserContext | { error: string; code: string }): v is { error: string; code: string } {
  return 'code' in v && !('id' in v);
}

const createUserContext = (result: {
  userId?: string;
  email?: string;
  role?: string;
  orgId?: string;
  sessionId?: string;
}): UserContext | null => {
  if (!result.userId || !result.email || !result.role) {
    return null;
  }

  return {
    id: result.userId,
    email: result.email,
    role: result.role,
    organizationId: result.orgId ?? ADMIN_ORG_ID,
    sessionId: result.sessionId,
  };
};

const getBearerToken = ({
  headers,
  cookie,
}: {
  headers: { authorization?: string };
  cookie?: Record<string, { value?: unknown }>;
}): string | null => {
  const authHeader = headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  const rawValue = cookie?.access_token?.value;
  return typeof rawValue === 'string' ? rawValue : null;
};

// Elysia plugin to attach user context from JWT token
export function attachAuth<T extends Elysia>(app: T) {
  return app.derive(async (context) => {
    const token = getBearerToken(context);

    if (!token) {
      return { user: null };
    }

    const result = await validateJWTToken(token);
    return { user: result.valid ? createUserContext(result) : null };
  });
}

export function requireAuth<T extends Elysia>(app: T) {
  return app.guard({
    beforeHandle(context) {
      const result = getAuthenticatedUser(context);
      if (isAuthError(result)) return result;
    },
  });
}

export function requireAdmin<T extends Elysia>(app: T) {
  return app.guard({
    beforeHandle(context) {
      const result = getAuthenticatedUser(context);
      if (isAuthError(result)) return result;
      if (result.role !== 'admin') {
        logger.warn('Non-admin user attempted admin access', {
          userId: result.id,
          role: result.role,
        });
        context.set.status = 403;
        return { error: 'Admin access required', code: 'ADMIN_REQUIRED' };
      }
    },
  });
}

export function requireOperator<T extends Elysia>(app: T) {
  return app.guard({
    beforeHandle(context) {
      const result = getAuthenticatedUser(context);
      if (isAuthError(result)) return result;

      const role = (result.role || '').toLowerCase();
      const allowedRoles = ['admin', 'operator', 'security_admin', 'security-admin'];

      if (!allowedRoles.includes(role)) {
        logger.warn('Insufficient privileges for operator access', {
          userId: result.id,
          role: result.role,
          requiredRoles: allowedRoles,
        });
        context.set.status = 403;
        return { error: 'Operator access required', code: 'OPERATOR_REQUIRED' };
      }
    },
  });
}

// Helper combinators for Elysia
// Accept AnyElysia so group-scoped instances (with non-empty prefix) are valid callers.
export const withOptionalAuth = (app: AnyElysia) => attachAuth(app);
export const withRequiredAuth = (app: AnyElysia) => requireAuth(attachAuth(app));
export const withAdminGuard = (app: AnyElysia) => requireAdmin(attachAuth(app));
export const withOperatorGuard = (app: AnyElysia) => requireOperator(attachAuth(app));

// Legacy middleware adapter - wraps Elysia handlers to work with existing route structure
export const authMiddleware = attachAuth;
export const optionalAuth = attachAuth;

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Elysia plugin to attach user context from nginx-forwarded headers (X-User-ID, X-User-Email, X-User-Role).
 * Use this when nginx handles JWT validation via auth_request and forwards user info in headers.
 */
export function attachNginxAuth<T extends Elysia>(app: T) {
  return app.derive(({ headers }) => {
    // Edge-trust gate: when EDGE_AUTH_SECRET is configured, only trust the
    // forwarded identity headers on requests that carry a matching X-Edge-Auth
    // header — i.e. requests that actually passed through the Cloudflare Worker.
    // This prevents a client from reaching the public Fly app directly and
    // forging X-User-* headers to impersonate any user.
    const edgeSecret = process.env.EDGE_AUTH_SECRET;
    if (!edgeSecret) {
      // Fail closed in production: with no shared secret we cannot distinguish a
      // request that passed through the trusted edge from one that hit the public
      // app directly, so we must NOT trust X-User-* headers. In dev/test we keep
      // trusting them so local flows work without the edge.
      if (process.env.NODE_ENV === 'production') {
        logger.error(
          'attachNginxAuth: EDGE_AUTH_SECRET is not set in production — refusing forwarded identity headers (fail-closed)'
        );
        return { user: null };
      }
    } else if (headers['x-edge-auth'] !== edgeSecret) {
      return { user: null };
    }

    const userId = headers['x-user-id'];
    const email = headers['x-user-email'];
    const role = headers['x-user-role'];
    const org = headers['x-user-org'];

    logger.debug('attachNginxAuth: checking headers', {
      hasUserId: !!userId,
      userId: userId?.substring(0, 8),
      headerKeys: Object.keys(headers).filter(
        (k) => k.toLowerCase().includes('user') || k.toLowerCase().includes('auth')
      ),
    });

    // Validate userId is a proper UUID
    if (!userId || !UUID_REGEX.test(userId)) {
      return { user: null };
    }

    return {
      user: {
        id: userId,
        email: email || '',
        role: role || 'user',
        // Tenant comes from the edge-forwarded X-User-Org (derived from the
        // token's orgId claim). Fall back to the admin org only when the edge did
        // not forward one (legacy tokens / pre-rollout).
        organizationId: org && UUID_REGEX.test(org) ? org : ADMIN_ORG_ID,
      },
    };
  });
}

/**
 * Elysia guard to require nginx-forwarded authentication.
 * Returns 401 if X-User-ID header is missing or not a valid UUID.
 */
export function requireNginxAuth<T extends Elysia>(app: T) {
  return app.guard({
    beforeHandle(context) {
      const user = getValidatedUserContext(context);
      if (!user || !user.id) {
        logger.warn('Nginx auth required but user not found in headers');
        context.set.status = 401;
        return { error: 'Authentication required: valid user ID not found', code: 'AUTH_REQUIRED' };
      }
    },
  });
}

export const withNginxAuth = (app: AnyElysia) => requireNginxAuth(attachNginxAuth(app));

/**
 * Runtime helper for route handlers behind withNginxAuth.
 * Elysia's type system cannot infer the derived `user` field through plugin/group
 * boundaries, so handlers must read it through this helper which performs a
 * runtime guard. Because requireNginxAuth always returns 401 before the handler
 * is invoked, the guard should never throw in production.
 */
export function getNginxUser(ctx: unknown): UserContext {
  if (typeof ctx !== 'object' || ctx === null || !('user' in ctx)) {
    throw new Error('getNginxUser: user not found in context — withNginxAuth guard did not run');
  }
  const user = ctx.user;
  if (
    typeof user !== 'object' ||
    user === null ||
    !('id' in user) ||
    typeof user.id !== 'string' ||
    !('email' in user) ||
    typeof user.email !== 'string' ||
    !('role' in user) ||
    typeof user.role !== 'string' ||
    !('organizationId' in user) ||
    typeof user.organizationId !== 'string'
  ) {
    throw new Error('getNginxUser: invalid user context — withNginxAuth guard did not run');
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    sessionId: 'sessionId' in user && typeof user.sessionId === 'string' ? user.sessionId : undefined,
  };
}

// Utility function to validate JWT secret at runtime
export const validateJWTConfiguration = (): { isValid: boolean; warnings: string[] } => {
  const warnings: string[] = [];
  let isValid = true;

  if (!config.jwt.secret) {
    warnings.push('JWT secret is not configured in shared config');
    isValid = false;
  } else {
    if (config.jwt.secret === 'uaip_dev_jwt_secret_key_change_in_production') {
      warnings.push('Using default JWT secret - change in production');
    }

    if (config.jwt.secret.length < 32) {
      warnings.push('JWT secret is shorter than recommended 32 characters');
    }
  }

  if (!config.jwt.issuer) {
    warnings.push('JWT issuer is not configured');
  }

  if (!config.jwt.audience) {
    warnings.push('JWT audience is not configured');
  }

  if (!config.jwt.expiresIn) {
    warnings.push('JWT expiration time is not configured');
  }

  return { isValid, warnings };
};

// Function to validate JWT configuration at service startup
export const validateJWTSetup = (): void => {
  const validation = validateJWTConfiguration();

  if (!validation.isValid) {
    logger.error('JWT configuration is invalid', {
      warnings: validation.warnings,
      environment: config.environment,
    });
    throw new Error('JWT configuration is invalid - service cannot start');
  }

  if (validation.warnings.length > 0) {
    logger.warn('JWT configuration warnings', {
      warnings: validation.warnings,
      environment: config.environment,
    });
  }

  logger.info('JWT configuration validated successfully', {
    secretLength: config.jwt.secret.length,
    secretPrefix: config.jwt.secret.substring(0, 8) + '...',
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    expiresIn: config.jwt.expiresIn,
    environment: config.environment,
  });
};

// Utility function to help diagnose JWT signature issues
export const diagnoseJWTSignatureError = (
  token: string
): {
  tokenInfo: unknown;
  possibleCauses: string[];
  recommendations: string[];
  configInfo: unknown;
} => {
  const possibleCauses = [
    'Token was signed with a different JWT secret',
    'JWT secret configuration has changed since token was issued',
    'Token has been tampered with or corrupted',
    'Token was issued by a different service/environment',
    'Clock skew between token issuer and verifier',
    'Token issuer/audience mismatch',
  ];

  const recommendations = [
    'Verify JWT secret is consistent across all services',
    'Check if token was issued by the correct authentication service',
    'Ensure token has not been modified during transmission',
    'Verify the token format and structure',
    'Check system clocks are synchronized',
    'Validate issuer and audience claims match configuration',
  ];

  let tokenInfo: unknown = {};

  try {
    const decoded = jwt.decode(token, { complete: true });
    tokenInfo = {
      header: decoded?.header,
      payload: decoded?.payload,
      isValidFormat: !!decoded,
      tokenLength: token.length,
    };
  } catch {
    tokenInfo = {
      error: 'Failed to decode token structure',
      tokenLength: token.length,
      isValidFormat: false,
    };
  }

  const configInfo = {
    expectedIssuer: config.jwt.issuer,
    expectedAudience: config.jwt.audience,
    secretLength: config.jwt.secret.length,
    environment: config.environment,
    expiresIn: config.jwt.expiresIn,
  };

  return { tokenInfo, possibleCauses, recommendations, configInfo };
};

type TestJWTTokenResult = {
  isValid: boolean;
  error?: string;
  payload?: unknown;
  diagnostics?: unknown;
};

export const testJWTToken = async (token: string): Promise<TestJWTTokenResult> => {
  try {
    const decoded = await JWTValidator.verify(token);
    return {
      isValid: true,
      payload: {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        iat: decoded.iat,
        exp: decoded.exp,
        isExpired: decoded.exp && Date.now() >= decoded.exp * 1000,
        issuer: decoded.iss,
        audience: decoded.aud,
      },
    };
  } catch (error) {
    const diagnostics = diagnoseJWTSignatureError(token);
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      diagnostics,
    };
  }
};

type ValidateJWTTokenResult = {
  valid: boolean;
  userId?: string;
  email?: string;
  role?: string;
  orgId?: string;
  username?: string;
  sessionId?: string;
  securityLevel?: number;
  complianceFlags?: string[];
  reason?: string;
};

export const validateJWTToken = async (token: string): Promise<ValidateJWTTokenResult> => {
  try {
    // verifyAny dispatches by the token's alg header (RS256 or HS256) with
    // downgrade protection, so both new RS256 tokens and any still-valid legacy
    // HS256 tokens are accepted during the migration window.
    const decoded = await JWTValidator.verifyAny(token);

    if (!decoded.userId || !decoded.email || !decoded.role) {
      return { valid: false, reason: 'Invalid token payload - missing required fields' };
    }

    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return { valid: false, reason: 'Token expired' };
    }

    return {
      valid: true,
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      orgId: decoded.orgId,
      username: decoded.email.split('@')[0],
      sessionId:
        decoded.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      securityLevel: 3,
      complianceFlags: [],
    };
  } catch (error) {
    logger.warn('JWT token validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      tokenLength: token?.length || 0,
    });
    return {
      valid: false,
      reason: error instanceof Error ? error.message : 'Token validation failed',
    };
  }
};
