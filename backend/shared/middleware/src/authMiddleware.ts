import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger, ApiError } from '@uaip/utils';
import { config } from '@uaip/config';
import { JWTValidator } from './JWTValidator.js';
import './types.js';

// JWT Payload interface
interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  sessionId?: string;
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    req.startTime = Date.now();
    req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Authorization token required', 'MISSING_TOKEN');
    }

    const token = authHeader.substring(7);
    const decoded = JWTValidator.verify(token);

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      sessionId: decoded.sessionId
    };

    next();
  } catch (error) {
    next(error);
  }
};


// Optional middleware for admin-only routes
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    logger.warn('Admin access attempted without authentication', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    return next(new ApiError(401, 'Authentication required', 'AUTH_REQUIRED'));
  }

  if (req.user.role !== 'admin') {
    logger.warn('Non-admin user attempted admin access', {
      userId: req.user.id,
      role: req.user.role,
      path: req.path,
      method: req.method
    });
    return next(new ApiError(403, 'Admin access required', 'ADMIN_REQUIRED'));
  }

  logger.debug('Admin access granted', {
    userId: req.user.id,
    path: req.path,
    method: req.method
  });

  next();
};

// Optional middleware for operator+ level access
export const requireOperator = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    logger.warn('Operator access attempted without authentication', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    return next(new ApiError(401, 'Authentication required', 'AUTH_REQUIRED'));
  }

  const allowedRoles = ['admin', 'operator'];
  if (!allowedRoles.includes(req.user.role)) {
    logger.warn('Insufficient privileges for operator access', {
      userId: req.user.id,
      role: req.user.role,
      requiredRoles: allowedRoles,
      path: req.path,
      method: req.method
    });
    return next(new ApiError(403, 'Operator access required', 'OPERATOR_REQUIRED'));
  }

  logger.debug('Operator access granted', {
    userId: req.user.id,
    role: req.user.role,
    path: req.path,
    method: req.method
  });

  next();
};

// Middleware to extract user info without requiring authentication (for public endpoints)
export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        const decoded = JWTValidator.verify(token);

        req.user = {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          sessionId: decoded.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        logger.debug('Optional auth successful', {
          userId: decoded.userId,
          role: decoded.role,
          path: req.path
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Optional auth failed';
        // Ignore JWT errors for optional auth but log for debugging
        logger.debug('Optional auth failed, continuing without authentication', {
          error: errorMessage,
          path: req.path,
          method: req.method
        });
      }
    }

    next();
  } catch (error) {
    // Continue without authentication for optional auth
    logger.debug('Optional auth middleware error, continuing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path
    });
    next();
  }
};

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

  // Additional JWT configuration validation
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

// Utility function to help diagnose JWT signature issues
export const diagnoseJWTSignatureError = (token: string): {
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
    'Token issuer/audience mismatch'
  ];

  const recommendations = [
    'Verify JWT secret is consistent across all services',
    'Check if token was issued by the correct authentication service',
    'Ensure token has not been modified during transmission',
    'Verify the token format and structure',
    'Check system clocks are synchronized',
    'Validate issuer and audience claims match configuration'
  ];

  let tokenInfo: any = {};

  try {
    // Decode without verification to inspect token structure
    const decoded = jwt.decode(token, { complete: true });
    tokenInfo = {
      header: decoded?.header,
      payload: decoded?.payload,
      isValidFormat: !!decoded,
      tokenLength: token.length
    };
  } catch (error) {
    tokenInfo = {
      error: 'Failed to decode token structure',
      tokenLength: token.length,
      isValidFormat: false
    };
  }

  const configInfo = {
    expectedIssuer: config.jwt.issuer,
    expectedAudience: config.jwt.audience,
    secretLength: config.jwt.secret.length,
    environment: config.environment,
    expiresIn: config.jwt.expiresIn
  };

  return { tokenInfo, possibleCauses, recommendations, configInfo };
};

// Function to validate JWT configuration at service startup
export const validateJWTSetup = (): void => {
  const validation = validateJWTConfiguration();

  if (!validation.isValid) {
    logger.error('JWT configuration is invalid', {
      warnings: validation.warnings,
      environment: config.environment
    });
    throw new Error('JWT configuration is invalid - service cannot start');
  }

  if (validation.warnings.length > 0) {
    logger.warn('JWT configuration warnings', {
      warnings: validation.warnings,
      environment: config.environment
    });
  }

  logger.info('JWT configuration validated successfully', {
    secretLength: config.jwt.secret.length,
    secretPrefix: config.jwt.secret.substring(0, 8) + '...',
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    expiresIn: config.jwt.expiresIn,
    environment: config.environment
  });
};

// Utility function to test JWT token validation (for debugging)
export const testJWTToken = (token: string): {
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
        audience: decoded.aud
      }
    };
  } catch (error) {
    const diagnostics = diagnoseJWTSignatureError(token);
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      diagnostics
    };
  }
};

// Standalone JWT validation function for WebSocket and other contexts
export const validateJWTToken = async (token: string): Promise<{
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
  // Add timeout wrapper to prevent hanging
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn('JWT token validation timed out', { tokenLength: token?.length || 0 });
      resolve({
        valid: false,
        reason: 'Authentication service timeout'
      });
    }, 5000); // 5 second timeout

    try {
      // Verify JWT token using JWTValidator (synchronous operation)
      const decoded = JWTValidator.verify(token);

      clearTimeout(timeout);

      // Validate token payload structure
      if (!decoded.userId || !decoded.email || !decoded.role) {
        resolve({
          valid: false,
          reason: 'Invalid token payload - missing required fields'
        });
        return;
      }

      // Check if token is expired (additional check beyond JWT verification)
      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        resolve({
          valid: false,
          reason: 'Token expired'
        });
        return;
      }

      resolve({
        valid: true,
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        username: decoded.email.split('@')[0], // Extract username from email
        sessionId: decoded.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        securityLevel: 3, // Default security level
        complianceFlags: [] // Default empty compliance flags
      });

    } catch (error) {
      clearTimeout(timeout);
      
      logger.warn('JWT token validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tokenLength: token?.length || 0
      });

      resolve({
        valid: false,
        reason: error instanceof Error ? error.message : 'Token validation failed'
      });
    }
  });
}; 