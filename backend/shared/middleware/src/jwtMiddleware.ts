import { Elysia } from 'elysia';
import * as jwt from 'jsonwebtoken';
import { logger } from '@uaip/utils';
import { z } from 'zod';

// JWT Payload schema
const jwtPayloadSchema = z.object({
  userId: z.string(),
  email: z.string().email().optional(),
  role: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  iat: z.number(),
  exp: z.number(),
});

export type JWTPayload = z.infer<typeof jwtPayloadSchema>;

// User type for middleware context
export interface JWTUser {
  id: string;
  email?: string;
  role?: string;
  permissions: string[];
}

// Auth error type
export interface AuthError {
  error: string;
  details?: string;
}

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
      ...config,
    };

    // Clean cache periodically
    setInterval(() => this.cleanCache(), 60000);
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
        audience: this.config.audience,
      }) as any;

      const payload = jwtPayloadSchema.parse(decoded);

      // Cache the result
      this.tokenCache.set(token, {
        payload,
        expiry: payload.exp * 1000,
      });

      return payload;
    } catch (error) {
      logger.warn('JWT verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public sign(
    payload: Omit<JWTPayload, 'iat' | 'exp'>,
    options?: { expiresIn?: string | number }
  ): string {
    const expiresIn = options?.expiresIn || this.config.expiresIn;
    const signOptions: jwt.SignOptions = {
      algorithm: this.config.algorithm || 'HS256',
      issuer: this.config.issuer,
      audience: this.config.audience,
      ...(expiresIn && { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] }),
    };

    return jwt.sign(payload, this.config.secret, signOptions);
  }

  public signRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    const expiresIn = this.config.refreshExpiresIn;
    const signOptions: jwt.SignOptions = {
      algorithm: this.config.algorithm || 'HS256',
      expiresIn:
        typeof expiresIn === 'number' ? expiresIn : (expiresIn as jwt.SignOptions['expiresIn']),
      issuer: this.config.issuer,
      audience: this.config.audience,
    };

    return jwt.sign(payload, this.config.secret, signOptions);
  }

  public extractToken(request: Request): string | null {
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check query parameter as fallback
    const url = new URL(request.url);
    const queryToken = url.searchParams.get('token');
    if (queryToken) {
      return queryToken;
    }

    return null;
  }

  public decode(token: string): any {
    return jwt.decode(token, { complete: true });
  }
}

// Elysia JWT middleware plugin
export function createJWTMiddleware(options?: {
  optional?: boolean;
  extractToken?: (request: Request) => string | null;
}) {
  return (app: Elysia) => {
    return app.derive(async ({ request, set }) => {
      try {
        const validator = JWTValidator.getInstance();
        const token = options?.extractToken
          ? options.extractToken(request)
          : validator.extractToken(request);

        if (!token) {
          if (options?.optional) {
            return { user: null as JWTUser | null };
          }
          set.status = 401;
          return { user: null as JWTUser | null, authError: { error: 'No token provided' } as AuthError };
        }

        const payload = validator.verify(token);

        return {
          user: {
            id: payload.userId,
            email: payload.email,
            role: payload.role,
            permissions: payload.permissions || [],
          } as JWTUser,
        };
      } catch (error) {
        logger.warn('JWT middleware authentication failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        if (options?.optional) {
          return { user: null as JWTUser | null };
        }

        set.status = 401;
        return {
          user: null as JWTUser | null,
          authError: {
            error: 'Invalid token',
            details: error instanceof Error ? error.message : 'Token verification failed',
          } as AuthError,
        };
      }
    });
  };
}

// Role-based guard
export function requireRole(...roles: string[]) {
  return (app: Elysia) => {
    return app.guard({
      beforeHandle(ctx) {
        const { user, set } = ctx as unknown as {
          user: { role: string } | null;
          set: { status: number };
        };
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }

        if (!roles.includes(user.role)) {
          set.status = 403;
          return {
            error: 'Insufficient role',
            required: roles,
            current: user.role,
          };
        }
      },
    });
  };
}

// Permission-based guard
export function requirePermissions(...permissions: string[]) {
  return (app: Elysia) => {
    return app.guard({
      beforeHandle(ctx) {
        const { user, set } = ctx as unknown as {
          user: { role: string; permissions?: string[] } | null;
          set: { status: number };
        };
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }

        const userPermissions = user.permissions || [];
        const hasPermissions = permissions.every((p) => userPermissions.includes(p));

        if (!hasPermissions && user.role !== 'admin') {
          set.status = 403;
          return {
            error: 'Insufficient permissions',
            required: permissions,
            current: userPermissions,
          };
        }
      },
    });
  };
}

// Refresh token handler
export async function refreshTokenMiddleware(request: Request): Promise<Response> {
  try {
    const validator = JWTValidator.getInstance();
    const body = await request.json();
    const refreshToken = body.refreshToken || request.headers.get('x-refresh-token');

    if (!refreshToken) {
      return new Response(JSON.stringify({ error: 'Refresh token required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = validator.verify(refreshToken);

    // Generate new access token
    const newAccessToken = validator.sign({
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions,
    });

    return new Response(
      JSON.stringify({
        accessToken: newAccessToken,
        tokenType: 'Bearer',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.warn('Refresh token failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return new Response(
      JSON.stringify({
        error: 'Invalid refresh token',
        details: error instanceof Error ? error.message : 'Token verification failed',
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
