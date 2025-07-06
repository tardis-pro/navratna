import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '@uaip/utils';
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

  private cleanCache(): void {
    const now = Date.now();
    for (const [token, cached] of this.tokenCache.entries()) {
      if (cached.expiry < now) {
        this.tokenCache.delete(token);
      }
    }
  }

  public verify(token: string): JWTPayload {
    // Check cache first
    const cached = this.tokenCache.get(token);
    if (cached && cached.expiry > Date.now()) {
      return cached.payload;
    }

    try {
      const decoded = jwt.verify(token, this.config.secret, {
        algorithms: [this.config.algorithm || 'HS256'],
        issuer: this.config.issuer,
        audience: this.config.audience
      }) as any;

      const payload = jwtPayloadSchema.parse(decoded);

      // Cache the result
      this.tokenCache.set(token, {
        payload,
        expiry: payload.exp * 1000
      });

      return payload;
    } catch (error) {
      logger.warn('JWT verification failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  public sign(payload: Omit<JWTPayload, 'iat' | 'exp'>, options?: { expiresIn?: string | number }): string {
    const expiresIn = options?.expiresIn || this.config.expiresIn;
    const signOptions: jwt.SignOptions = {
      algorithm: this.config.algorithm || 'HS256',
      issuer: this.config.issuer,
      audience: this.config.audience,
      ...(expiresIn && { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] })
    };

    return jwt.sign(payload, this.config.secret, signOptions);
  }

  public signRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    const expiresIn = this.config.refreshExpiresIn;
    const signOptions: jwt.SignOptions = {
      algorithm: this.config.algorithm || 'HS256',
      expiresIn: typeof expiresIn === 'number' ? expiresIn : expiresIn as jwt.SignOptions['expiresIn'],
      issuer: this.config.issuer,
      audience: this.config.audience
    };

    return jwt.sign(payload, this.config.secret, signOptions);
  }

  public extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check query parameter as fallback
    const queryToken = req.query.token as string;
    if (queryToken) {
      return queryToken;
    }

    return null;
  }

  public decode(token: string): any {
    return jwt.decode(token, { complete: true });
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

      const payload = validator.verify(token);

      // Extend the Request interface to include user
      (req as any).user = {
        id: payload.userId,
        email: payload.email,
        role: payload.role,
        permissions: payload.permissions || []
      };

      next();
    } catch (error) {
      logger.warn('JWT middleware authentication failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (options?.optional) {
        return next();
      }

      return res.status(401).json({
        error: 'Invalid token',
        details: error instanceof Error ? error.message : 'Token verification failed'
      });
    }
  };
};

// Role-based middleware
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({
        error: 'Insufficient role',
        required: roles,
        current: user.role
      });
    }

    next();
  };
};

// Permission-based middleware
export const requirePermissions = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userPermissions = user.permissions || [];
    const hasPermissions = permissions.every(p => userPermissions.includes(p));

    if (!hasPermissions && user.role !== 'admin') {
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
    const validator = JWTValidator.getInstance();
    const refreshToken = req.body.refreshToken || req.headers['x-refresh-token'];

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const payload = validator.verify(refreshToken);

    // Generate new access token
    const newAccessToken = validator.sign({
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions
    });

    res.json({
      accessToken: newAccessToken,
      tokenType: 'Bearer',
      expiresIn: validator['config'].expiresIn
    });
  } catch (error) {
    logger.warn('Refresh token failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(401).json({
      error: 'Invalid refresh token',
      details: error instanceof Error ? error.message : 'Token verification failed'
    });
  }
};
