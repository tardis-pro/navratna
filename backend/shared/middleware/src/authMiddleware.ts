import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { User, SecurityLevel } from '@uaip/types';
import { config } from '@uaip/config';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: {
        id: string;
        email: string;
        role: string;
        sessionId?: string;
      };
      startTime?: number;
    }
  }
}

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

// Simplified user interface for authentication context
interface AuthUser {
  id: string;
  email: string;
  role: string;
  sessionId?: string;
}

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  startTime?: number;
}

// Validate JWT secret on module load
const validateJWTSecret = (): string => {
  const jwtSecret = config.jwt.secret;
  
  if (!jwtSecret) {
    logger.error('JWT secret is not configured in shared config');
    throw new Error('JWT secret is required in configuration');
  }
  
  if (jwtSecret === 'uaip_dev_jwt_secret_key_change_in_production') {
    logger.warn('Using default JWT secret - this should be changed in production');
  }
  
  if (jwtSecret.length < 32) {
    logger.warn('JWT secret is shorter than recommended 32 characters');
  }
  
  return jwtSecret;
};

// Cache the validated JWT secret
const JWT_SECRET = validateJWTSecret();

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let token: string | undefined;
  
  try {
    // Set request start time for performance tracking
    req.startTime = Date.now();
    
    // Generate request ID for tracing
    req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.debug('Missing or invalid authorization header', {
        requestId: req.id,
        path: req.path,
        method: req.method,
        hasAuthHeader: !!authHeader,
        authHeaderPrefix: authHeader?.substring(0, 10) + '...',
        allHeaders: Object.keys(req.headers)
      });
      throw new ApiError(401, 'Authorization token required', 'MISSING_TOKEN');
    }

    token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Log token info for debugging (without exposing the actual token)
    logger.debug('Attempting JWT verification', {
      requestId: req.id,
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 10) + '...',
      path: req.path,
      method: req.method
    });

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

    // Validate token payload
    if (!decoded.userId || !decoded.email || !decoded.role) {
      logger.warn('Invalid token payload structure', {
        requestId: req.id,
        hasUserId: !!decoded.userId,
        hasEmail: !!decoded.email,
        hasRole: !!decoded.role,
        tokenIat: decoded.iat,
        tokenExp: decoded.exp
      });
      throw new ApiError(401, 'Invalid token payload', 'INVALID_TOKEN');
    }

    // Check if token is expired (additional check beyond JWT verification)
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      logger.warn('Token expired', {
        requestId: req.id,
        userId: decoded.userId,
        expiredAt: new Date(decoded.exp * 1000).toISOString(),
        currentTime: new Date().toISOString()
      });
      throw new ApiError(401, 'Token expired', 'TOKEN_EXPIRED');
    }

    // Set user context on request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      sessionId: decoded.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    // Log successful authentication
    logger.debug('User authenticated successfully', {
      userId: decoded.userId,
      role: decoded.role,
      requestId: req.id,
      path: req.path,
      method: req.method,
      sessionId: req.user.sessionId
    });

    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown authentication error';
    
    // Enhanced error logging with more context
    logger.warn('Authentication failed', {
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      requestId: req.id,
      timestamp: new Date().toISOString()
    });

    // Handle specific JWT errors with better error messages
    if (error instanceof jwt.JsonWebTokenError) {
      if (error.name === 'TokenExpiredError') {
        logger.info('Token expired during verification', {
          requestId: req.id,
          path: req.path,
          expiredAt: (error as any).expiredAt
        });
        return next(new ApiError(401, 'Token expired', 'TOKEN_EXPIRED'));
      } else if (error.name === 'NotBeforeError') {
        logger.warn('Token not active yet', {
          requestId: req.id,
          path: req.path,
          notBefore: (error as any).notBefore
        });
        return next(new ApiError(401, 'Token not active yet', 'TOKEN_NOT_ACTIVE'));
      } else if (error.message === 'invalid signature') {
        // Get diagnostic information for signature errors (if token is available)
        const diagnostics = token ? diagnoseJWTSignatureError(token) : null;
        
        logger.warn('JWT token has invalid signature', {
          requestId: req.id,
          path: req.path,
          jwtError: error.message,
          errorName: error.name,
          tokenInfo: diagnostics?.tokenInfo,
          possibleCauses: diagnostics?.possibleCauses,
          configInfo: diagnostics?.configInfo,
          jwtSecretLength: config.jwt.secret.length,
          jwtSecretPrefix: config.jwt.secret.substring(0, 8) + '...'
        });
        return next(new ApiError(401, 'Invalid token signature - token may be tampered with or signed with wrong secret', 'INVALID_SIGNATURE'));
      } else if (error.message === 'jwt malformed') {
        logger.warn('JWT token is malformed', {
          requestId: req.id,
          path: req.path,
          jwtError: error.message
        });
        return next(new ApiError(401, 'Malformed token format', 'MALFORMED_TOKEN'));
      } else if (error.name === 'JsonWebTokenError') {
        logger.warn('Invalid JWT token format or other JWT error', {
          requestId: req.id,
          path: req.path,
          jwtError: error.message,
          errorName: error.name
        });
        return next(new ApiError(401, `Invalid token: ${error.message}`, 'INVALID_TOKEN'));
      }
    }

    if (error instanceof ApiError) {
      return next(error);
    }

    // Log unexpected errors with full context
    logger.error('Unexpected authentication error', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      requestId: req.id,
      path: req.path,
      method: req.method
    });

    next(new ApiError(401, 'Authentication failed', 'AUTH_ERROR'));
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
        const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
        
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
    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;
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