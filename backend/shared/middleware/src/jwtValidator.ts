import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '@uaip/utils/logger';
import { z } from 'zod';

// JWT Payload schema
const jwtPayloadSchema = z.object({
  userId: z.string(),
  email: z.string().email().optional(),
  role: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  iat: z.number(),
  exp: z.number()
});

export type JWTPayload = z.infer<typeof jwtPayloadSchema>;

// Configuration interface
export interface JWTConfig {
  secret: string;
  publicKey?: string;
  algorithm?: jwt.Algorithm;
  issuer?: string;
  audience?: string;
  expiresIn?: string | number;
  refreshExpiresIn?: string | number;
}

// Singleton JWT Validator class
export class JWTValidator {
  private static instance: JWTValidator;
  private config: JWTConfig;
  private tokenCache = new Map<string, { payload: JWTPayload; expiry: number }>();

  private constructor(config: JWTConfig) {
    this.config = {
      algorithm: 'HS256',
      expiresIn: '1h',
      refreshExpiresIn: '7d',
      ...config
    };
    
    // Clean cache periodically
    setInterval(() => this.cleanCache(), 60000); // Every minute
  }

  public static getInstance(config?: JWTConfig): JWTValidator {
    if (!JWTValidator.instance) {
      if (!config) {
        throw new Error('JWT configuration required for first initialization');
      }
      JWTValidator.instance = new JWTValidator(config);
    }
    return JWTValidator.instance;
  }

  // Generate token
  public generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    const tokenPayload = {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (typeof this.config.expiresIn === 'number' 
        ? this.config.expiresIn 
        : parseInt(this.config.expiresIn as string))
    };

    const options: jwt.SignOptions = {
      algorithm: this.config.algorithm,
      issuer: this.config.issuer,
      audience: this.config.audience
    };

    return jwt.sign(tokenPayload, this.config.secret, options);
  }

  // Generate refresh token
  public generateRefreshToken(userId: string): string {
    const payload = {
      userId,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000)
    };

    const options: jwt.SignOptions = {
      algorithm: this.config.algorithm,
      expiresIn: this.config.refreshExpiresIn,
      issuer: this.config.issuer
    };

    return jwt.sign(payload, this.config.secret, options);
  }

  // Verify token
  public verifyToken(token: string): JWTPayload {
    // Check cache first
    const cached = this.tokenCache.get(token);
    if (cached && cached.expiry > Date.now()) {
      return cached.payload;
    }

    try {
      const options: jwt.VerifyOptions = {
        algorithms: [this.config.algorithm as jwt.Algorithm],
        issuer: this.config.issuer,
        audience: this.config.audience
      };

      const decoded = jwt.verify(token, this.config.secret, options);
      const payload = jwtPayloadSchema.parse(decoded);

      // Cache valid token
      this.tokenCache.set(token, {
        payload,
        expiry: payload.exp * 1000
      });

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  // Verify refresh token
  public verifyRefreshToken(token: string): { userId: string } {
    try {
      const decoded = jwt.verify(token, this.config.secret) as any;
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      return { userId: decoded.userId };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token expired');
      }
      throw new Error('Invalid refresh token');
    }
  }

  // Decode token without verification (for debugging)
  public decodeToken(token: string): any {
    return jwt.decode(token);
  }

  // Clean expired tokens from cache
  private cleanCache(): void {
    const now = Date.now();
    for (const [token, data] of this.tokenCache.entries()) {
      if (data.expiry <= now) {
        this.tokenCache.delete(token);
      }
    }
  }

  // Extract token from request
  public extractToken(req: Request): string | null {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check cookie
    if (req.cookies?.token) {
      return req.cookies.token;
    }

    // Check query parameter (less secure, use with caution)
    if (req.query.token && typeof req.query.token === 'string') {
      return req.query.token;
    }

    return null;
  }
}

// Middleware factory
export const createJWTMiddleware = (options?: {
  optional?: boolean;
  extractToken?: (req: Request) => string | null;
}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validator = JWTValidator.getInstance();
      const token = options?.extractToken ? options.extractToken(req) : validator.extractToken(req);

      if (!token) {
        if (options?.optional) {
          return next();
        }
        return res.status(401).json({ error: 'No token provided' });
      }

      try {
        const payload = validator.verifyToken(token);
        req.user = {
          id: payload.userId,
          email: payload.email,
          role: payload.role,
          permissions: payload.permissions || []
        };
        next();
      } catch (error) {
        logger.error('JWT validation failed:', error);
        res.status(401).json({ error: error instanceof Error ? error.message : 'Invalid token' });
      }
    } catch (error) {
      logger.error('JWT middleware error:', error);
      res.status(500).json({ error: 'Authentication error' });
    }
  };
};

// Role-based middleware
export const requireRole = (role: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: role,
        current: req.user.role 
      });
    }

    next();
  };
};

// Permission-based middleware
export const requirePermissions = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userPermissions = req.user.permissions || [];
    const hasPermissions = permissions.every(p => userPermissions.includes(p));

    if (!hasPermissions && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permissions,
        current: userPermissions
      });
    }

    next();
  };
};

// Refresh token middleware
export const refreshTokenMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const validator = JWTValidator.getInstance();
    const { userId } = validator.verifyRefreshToken(refreshToken);

    // Generate new tokens
    const newToken = validator.generateToken({ userId });
    const newRefreshToken = validator.generateRefreshToken(userId);

    res.json({
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    logger.error('Refresh token error:', error);
    res.status(401).json({ error: error instanceof Error ? error.message : 'Invalid refresh token' });
  }
};

// Export everything
export default {
  JWTValidator,
  createJWTMiddleware,
  requireRole,
  requirePermissions,
  refreshTokenMiddleware
};