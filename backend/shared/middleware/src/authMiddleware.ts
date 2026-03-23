import { Elysia } from 'elysia';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import type { AuthContext, RequiredAuthContext, UserContext } from '@uaip/types';
import { JWTValidator } from './JWTValidator.js';

export type { UserContext };

// Context type for Elysia route handlers where withRequiredAuth has been applied
export type AuthedContext = RequiredAuthContext;

// Context type for Elysia route handlers where withOptionalAuth has been applied
export type OptionalAuthContext = AuthContext;

type ContextWithOptionalUser = { user?: UserContext | null; [key: string]: unknown };

const hasUserContext = (
  context: ContextWithOptionalUser
): context is { user: UserContext; [key: string]: unknown } => context.user != null;

const getValidatedUserContext = (context: ContextWithOptionalUser): UserContext | null => {
  if (!hasUserContext(context)) {
    return null;
  }

  return context.user;
};

const createUserContext = (result: {
  userId?: string;
  email?: string;
  role?: string;
  sessionId?: string;
}): UserContext | null => {
  if (!result.userId || !result.email || !result.role) {
    return null;
  }

  return {
    id: result.userId,
    email: result.email,
    role: result.role,
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

// Elysia guard to require authentication
export function requireAuth<T extends Elysia>(app: T) {
  return app.guard({
    beforeHandle(context) {
      const user = getValidatedUserContext(context);
      if (!user) {
        context.set.status = 401;
        return { error: 'Authentication required', code: 'AUTH_REQUIRED' };
      }
    },
  });
}

// Elysia guard to require admin role
export function requireAdmin<T extends Elysia>(app: T) {
  return app.guard({
    beforeHandle(context) {
      const user = getValidatedUserContext(context);
      if (!user) {
        context.set.status = 401;
        return { error: 'Authentication required', code: 'AUTH_REQUIRED' };
      }
      if (user.role !== 'admin') {
        logger.warn('Non-admin user attempted admin access', {
          userId: user.id,
          role: user.role,
        });
        context.set.status = 403;
        return { error: 'Admin access required', code: 'ADMIN_REQUIRED' };
      }
    },
  });
}

// Elysia guard to require operator+ level access
export function requireOperator<T extends Elysia>(app: T) {
  return app.guard({
    beforeHandle(context) {
      const user = getValidatedUserContext(context);
      if (!user) {
        context.set.status = 401;
        return { error: 'Authentication required', code: 'AUTH_REQUIRED' };
      }

      const role = (user.role || '').toLowerCase();
      const allowedRoles = ['admin', 'operator', 'security_admin', 'security-admin'];

      if (!allowedRoles.includes(role)) {
        logger.warn('Insufficient privileges for operator access', {
          userId: user.id,
          role: user.role,
          requiredRoles: allowedRoles,
        });
        context.set.status = 403;
        return { error: 'Operator access required', code: 'OPERATOR_REQUIRED' };
      }
    },
  });
}

// Helper combinators for Elysia
export const withOptionalAuth = attachAuth;
export const withRequiredAuth = <T extends Elysia>(app: T) => requireAuth(attachAuth(app));
export const withAdminGuard = <T extends Elysia>(app: T) => requireAdmin(attachAuth(app));
export const withOperatorGuard = <T extends Elysia>(app: T) => requireOperator(attachAuth(app));

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
    const userId = headers['x-user-id'];
    const email = headers['x-user-email'];
    const role = headers['x-user-role'];

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

// Combinator for nginx auth flow
export const withNginxAuth = <T extends Elysia>(app: T) => requireNginxAuth(attachNginxAuth(app));

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
    // Dynamically import jwt to decode without verification
    const jwt = require('jsonwebtoken');
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

// Utility function to test JWT token validation (for debugging)
export const testJWTToken = (
  token: string
): {
  isValid: boolean;
  error?: string;
  payload?: unknown;
  diagnostics?: unknown;
} => {
  try {
    const decoded = JWTValidator.verify(token);
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

// Standalone JWT validation function for WebSocket and other contexts
export const validateJWTToken = async (
  token: string
): Promise<{
  valid: boolean;
  userId?: string;
  email?: string;
  role?: string;
  username?: string;
  sessionId?: string;
  securityLevel?: number;
  complianceFlags?: string[];
  reason?: string;
}> => {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn('JWT token validation timed out', { tokenLength: token?.length || 0 });
      resolve({
        valid: false,
        reason: 'Authentication service timeout',
      });
    }, 5000);

    try {
      const decoded = JWTValidator.verify(token);

      clearTimeout(timeout);

      if (!decoded.userId || !decoded.email || !decoded.role) {
        resolve({
          valid: false,
          reason: 'Invalid token payload - missing required fields',
        });
        return;
      }

      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        resolve({
          valid: false,
          reason: 'Token expired',
        });
        return;
      }

      resolve({
        valid: true,
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        username: decoded.email.split('@')[0],
        sessionId:
          decoded.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        securityLevel: 3,
        complianceFlags: [],
      });
    } catch (error) {
      clearTimeout(timeout);

      logger.warn('JWT token validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tokenLength: token?.length || 0,
      });

      resolve({
        valid: false,
        reason: error instanceof Error ? error.message : 'Token validation failed',
      });
    }
  });
};
