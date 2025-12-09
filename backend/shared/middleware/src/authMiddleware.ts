import { Elysia } from 'elysia';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import type { UserContext, ElysiaSet } from '@uaip/types';
import { JWTValidator } from './JWTValidator.js';

export type { UserContext };

// Elysia plugin to attach user context from JWT token
export function attachAuth(app: Elysia): Elysia {
  return app.derive(async ({ headers }) => {
    const auth = headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return { user: null as UserContext | null };
    }

    const token = auth.substring(7);
    const result = await validateJWTToken(token);

    if (!result.valid) {
      return { user: null as UserContext | null };
    }

    return {
      user: {
        id: result.userId!,
        email: result.email!,
        role: result.role!,
        sessionId: result.sessionId,
      } as UserContext,
    };
  });
}

// Elysia guard to require authentication
export function requireAuth(app: Elysia): Elysia {
  return app.guard({
    beforeHandle(context) {
      const { user, set } = context as unknown as {
        user: UserContext | null;
        set: { status: number };
      };
      if (!user) {
        set.status = 401;
        return { error: 'Authentication required', code: 'AUTH_REQUIRED' };
      }
    },
  });
}

// Elysia guard to require admin role
export function requireAdmin(app: Elysia): Elysia {
  return app.guard({
    beforeHandle(context) {
      const { user, set } = context as unknown as {
        user: UserContext | null;
        set: { status: number };
      };
      if (!user) {
        set.status = 401;
        return { error: 'Authentication required', code: 'AUTH_REQUIRED' };
      }
      if (user.role !== 'admin') {
        logger.warn('Non-admin user attempted admin access', {
          userId: user.id,
          role: user.role,
        });
        set.status = 403;
        return { error: 'Admin access required', code: 'ADMIN_REQUIRED' };
      }
    },
  });
}

// Elysia guard to require operator+ level access
export function requireOperator(app: Elysia): Elysia {
  return app.guard({
    beforeHandle(context) {
      const { user, set } = context as unknown as {
        user: UserContext | null;
        set: { status: number };
      };
      if (!user) {
        set.status = 401;
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
        set.status = 403;
        return { error: 'Operator access required', code: 'OPERATOR_REQUIRED' };
      }
    },
  });
}

// Helper combinators for Elysia
export const withOptionalAuth = attachAuth;
export const withRequiredAuth = (app: Elysia) => requireAuth(attachAuth(app));
export const withAdminGuard = (app: Elysia) => requireAdmin(attachAuth(app));
export const withOperatorGuard = (app: Elysia) => requireOperator(attachAuth(app));

// Legacy middleware adapter - wraps Elysia handlers to work with existing route structure
export const authMiddleware = attachAuth;
export const optionalAuth = attachAuth;

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
  tokenInfo: any;
  possibleCauses: string[];
  recommendations: string[];
  configInfo: any;
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

  let tokenInfo: any = {};

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
  } catch (error) {
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
  payload?: any;
  diagnostics?: any;
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
