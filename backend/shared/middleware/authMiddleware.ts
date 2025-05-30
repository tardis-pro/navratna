import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '@uaip/utils/logger';
import { ApiError } from '@uaip/utils/errors';
import { User, SecurityLevel } from '@uaip/types';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: {
        id: string;
        email: string;
        role: string;
        sessionId: string;
      };
      startTime?: number;
    }
  }
}

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
  iat: number;
  exp: number;
}

// Simplified user interface for authentication context
interface AuthUser {
  id: string;
  email: string;
  role: string;
  sessionId: string;
}

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  startTime?: number;
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Set request start time for performance tracking
    req.startTime = Date.now();
    
    // Generate request ID for tracing
    req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Authorization token required', 'MISSING_TOKEN');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

    // Validate token payload
    if (!decoded.userId || !decoded.email || !decoded.role) {
      throw new ApiError(401, 'Invalid token payload', 'INVALID_TOKEN');
    }

    // Check if token is expired (additional check beyond JWT verification)
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      throw new ApiError(401, 'Token expired', 'TOKEN_EXPIRED');
    }

    // Set user context on request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      sessionId: decoded.sessionId
    };

    // Log successful authentication
    logger.debug('User authenticated', {
      userId: decoded.userId,
      role: decoded.role,
      requestId: req.id,
      path: req.path,
      method: req.method
    });

    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown authentication error';
    logger.warn('Authentication failed', {
      error: errorMessage,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });

    if (error instanceof jwt.JsonWebTokenError) {
      if (error.name === 'TokenExpiredError') {
        return next(new ApiError(401, 'Token expired', 'TOKEN_EXPIRED'));
      } else if (error.name === 'JsonWebTokenError') {
        return next(new ApiError(401, 'Invalid token', 'INVALID_TOKEN'));
      }
    }

    if (error instanceof ApiError) {
      return next(error);
    }

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
    return next(new ApiError(401, 'Authentication required', 'AUTH_REQUIRED'));
  }

  if (req.user.role !== 'admin') {
    return next(new ApiError(403, 'Admin access required', 'ADMIN_REQUIRED'));
  }

  next();
};

// Optional middleware for operator+ level access
export const requireOperator = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return next(new ApiError(401, 'Authentication required', 'AUTH_REQUIRED'));
  }

  const allowedRoles = ['admin', 'operator'];
  if (!allowedRoles.includes(req.user.role)) {
    return next(new ApiError(403, 'Operator access required', 'OPERATOR_REQUIRED'));
  }

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
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret-change-in-production') as JWTPayload;
        
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          sessionId: decoded.sessionId
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Optional auth failed';
        // Ignore JWT errors for optional auth
        logger.debug('Optional auth failed', { error: errorMessage });
      }
    }

    next();
  } catch (error) {
    // Continue without authentication for optional auth
    next();
  }
}; 