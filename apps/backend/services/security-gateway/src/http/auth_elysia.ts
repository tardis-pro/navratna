import { Elysia, t } from 'elysia';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { UserService, SessionService } from '@uaip/shared-services';
import { getRedisClient } from '@uaip/infra';
import {
  validateJWTToken,
  generateAuthTokens,
  attachAuth as _attachAuth,
  requireAuth as _requireAuth,
  withOptionalAuth,
  withRequiredAuth,
  csrfProtection,
  apiKeyAuth,
  createRateLimiter,
  JWTValidator,
  signJWT,
} from '@uaip/middleware';
// Note: All auth utilities now from shared middleware
import { AuditService } from '../services/audit_service.js';
import { AuditEventType } from '@uaip/types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

const parseExpiryToSeconds = (value?: string | number): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const trimmed = String(value).trim();
  const match = trimmed.match(/^(\d+)([smhd])$/i);
  if (!match) return undefined;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

  return amount * (multipliers[unit] || 0);
};

const getAuthCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.COOKIE_SAME_SITE || 'lax') as 'lax' | 'strict' | 'none',
  path: '/',
  ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
});

const getUserAgent = (request: Request, headers?: Record<string, string | undefined>) =>
  headers?.['user-agent'] ?? request.headers.get('user-agent') ?? undefined;

// Minimal structural type for an Elysia cookie jar entry — avoids importing Elysia's
// internal Cookie type. Method params are bivariant, so the real cookie jar is assignable.
type CookieSetter = { set: (options: Record<string, unknown>) => void };

/**
 * Set the access_token + refresh_token httpOnly cookies on the response.
 * Single source of truth for auth cookie behavior — reused by password login and OAuth callback.
 */
export function setAuthCookies(
  cookie: Record<string, CookieSetter>,
  tokens: { accessToken: string; refreshToken: string }
): void {
  const cookieOptions = getAuthCookieOptions();
  const accessTokenMaxAge = parseExpiryToSeconds(config.jwt.accessTokenExpiry);
  const refreshTokenMaxAge = parseExpiryToSeconds(config.jwt.refreshTokenExpiry);

  cookie['access_token'].set({
    value: tokens.accessToken,
    ...cookieOptions,
    ...(accessTokenMaxAge ? { maxAge: accessTokenMaxAge } : {}),
  });
  cookie['refresh_token'].set({
    value: tokens.refreshToken,
    ...cookieOptions,
    ...(refreshTokenMaxAge ? { maxAge: refreshTokenMaxAge } : {}),
  });
}

async function getServices() {
  return {
    userService: UserService.getInstance(),
    auditService: new AuditService(),
  };
}

// Schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().default(false),
});

const _refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
    ),
});

const subdomainTokenSchema = z.object({
  subdomain: z
    .string()
    .min(1, 'Subdomain is required')
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i,
      'Invalid subdomain format'
    ),
});

const internalTokenSchema = z.object({
  serviceName: z.string().min(1, 'Service name is required'),
  apiKey: z.string().min(1, 'API key is required'),
  permissions: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
});

type TokenInfo = {
  revokedAt?: Date | null;
  expiresAt: Date;
  user: { id: string; email: string; role: string; isActive?: boolean };
  [key: string]: unknown;
};

function isTokenInfo(v: unknown): v is TokenInfo {
  return (
    isRecord(v) &&
    'expiresAt' in v &&
    'user' in v &&
    typeof v['user'] === 'object'
  );
}

// Token generation now handled by shared generateAuthTokens from @uaip/middleware

async function getAuthUser(authorization?: string | null) {
  if (!authorization || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.substring(7);
  const result = await validateJWTToken(token);
  if (!result.valid) return null;
  return {
    id: result.userId!,
    email: result.email!,
    role: result.role!,
    sessionId: result.sessionId,
  };
}

// Strict rate limiter for sensitive auth endpoints: 10 attempts per 15 minutes.
// Read-only endpoints (/me, /validate, /csrf-token) are skipped.
const RATE_LIMITED_AUTH_PATHS = new Set(['/login', '/refresh', '/change-password', '/logout', '/subdomain-token']);
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: (request: Request) => {
    const url = new URL(request.url);
    const leaf = url.pathname.replace(/.*\/auth/, '');
    return !RATE_LIMITED_AUTH_PATHS.has(leaf);
  },
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again later.',
    },
  },
});

export function registerAuthRoutes() {
  return new Elysia().group('/api/v1/auth', (app) => withOptionalAuth(app)
    .use(authRateLimiter)
    // POST /login
    .post('/login', async ({ body, set, request, headers, cookie }) => {
      const parsed = loginSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: 'Validation Error', details: parsed.error.flatten() };
      }
      const { email, password, rememberMe } = parsed.data;
  
      try {
        const { userService, auditService } = await getServices();
        const user = await userService.findUserByEmail(email);
  
        if (!user) {
          await auditService.logSecurityEvent({
            eventType: AuditEventType.LOGIN_FAILED,
            userId: undefined,
            details: { email, reason: 'User not found' },
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: getUserAgent(request, headers as Record<string, string | undefined> | undefined),
          });
          set.status = 401;
          return { error: 'Authentication Failed', message: 'Invalid email or password' };
        }
  
        if (!user.isActive) {
          await auditService.logSecurityEvent({
            eventType: AuditEventType.LOGIN_FAILED,
            userId: user.id,
            details: { email, reason: 'Account inactive' },
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: getUserAgent(request, headers as Record<string, string | undefined> | undefined),
          });
          set.status = 401;
          return { error: 'Authentication Failed', message: 'Account is inactive' };
        }
  
        // Account lock check
        if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
          await auditService.logSecurityEvent({
            eventType: AuditEventType.LOGIN_FAILED,
            userId: user.id,
            details: { email, reason: 'Account locked' },
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: getUserAgent(request, headers as Record<string, string | undefined> | undefined),
          });
          set.status = 401;
          return {
            error: 'Authentication Failed',
            message: 'Account is temporarily locked due to multiple failed login attempts',
          };
        }
  
        if (!user.passwordHash) {
          set.status = 401;
          return { error: 'Authentication Failed', message: 'Invalid email or password' };
        }
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) {
          const failedAttempts = (user.failedLoginAttempts || 0) + 1;
          const maxAttempts = 5;
          const lockDuration = 30 * 60 * 1000; // 30 minutes
  
          await userService.updateLoginTracking(user.id, {
            failedLoginAttempts: failedAttempts,
            ...(failedAttempts >= maxAttempts
              ? { lockedUntil: new Date(Date.now() + lockDuration) }
              : {}),
          });
  
          await auditService.logSecurityEvent({
            eventType: AuditEventType.LOGIN_FAILED,
            userId: user.id,
            details: {
              email,
              reason: 'Invalid password',
              failedAttempts,
              accountLocked: failedAttempts >= maxAttempts,
            },
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: getUserAgent(request, headers as Record<string, string | undefined> | undefined),
          });
          set.status = 401;
          return { error: 'Authentication Failed', message: 'Invalid email or password' };
        }
  
        // Success
        await userService.resetLoginAttempts(user.id);
        const tokens = generateAuthTokens({
          userId: user.id,
          email: user.email,
          role: user.role,
          // TODO(tenant): read organizationId from user row once UserService.findUserByEmail returns it
          organizationId: (user as { organizationId?: string }).organizationId ?? '00000000-0000-0000-0000-000000000001',
        });
        await userService.createRefreshToken(
          user.id,
          tokens.refreshToken,
          new Date(Date.now() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000))
        );
  
        setAuthCookies(cookie, tokens);

        await auditService.logSecurityEvent({
          eventType: AuditEventType.LOGIN_SUCCESS,
          userId: user.id,
          details: { email, rememberMe },
          ipAddress: request.headers.get('x-forwarded-for') || '',
          userAgent: getUserAgent(request, headers as Record<string, string | undefined> | undefined),
        });
  
        return {
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              firstName: user.firstName || '',
              lastName: user.lastName || '',
              role: user.role,
              department: user.department || '',
              permissions: user.permissions || [],
              lastLoginAt: user.lastLoginAt,
            },
          },
          meta: { timestamp: new Date() },
        };
      } catch (error) {
        logger.error('Login error', { error, email });
        set.status = 500;
        return { error: 'Internal Server Error', message: 'An error occurred during login' };
      }
    }, {
      body: t.Object({
        email: t.String({ format: 'email' }),
        password: t.String({ minLength: 6 }),
        rememberMe: t.Optional(t.Boolean({ default: false })),
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            user: t.Object({
              id: t.String(),
              email: t.String(),
              firstName: t.String(),
              lastName: t.String(),
              role: t.String(),
              department: t.String(),
              permissions: t.Array(t.Any()),
              lastLoginAt: t.Optional(t.Any()),
            }),
          }),
          meta: t.Object({ timestamp: t.Any() }),
        }),
        400: t.Object({ error: t.String(), details: t.Optional(t.Any()) }),
        401: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
        500: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
      },
    })
  
    // POST /refresh
    .post('/refresh', async ({ set, cookie }) => {
      const rawCookieValue: unknown = cookie['refresh_token']?.value;
      const refreshToken = typeof rawCookieValue === 'string' ? rawCookieValue : undefined;
      if (!refreshToken) {
        set.status = 401;
        return { error: 'Unauthorized', message: 'No refresh token provided' };
      }
      try {
        // Verify refresh token signature (throws on invalid/expired)
        jwt.verify(refreshToken, config.jwt.refreshSecret);
        const { userService } = await getServices();
        const rawToken = await userService.getRefreshTokenWithUser(refreshToken);
        const tokenData: TokenInfo | null = isTokenInfo(rawToken) ? rawToken : null;
        if (!tokenData || tokenData.revokedAt || tokenData.expiresAt <= new Date()) {
          set.status = 401;
          return { error: 'Invalid Token', message: 'Refresh token not found or expired' };
        }
        if (!tokenData.user.isActive) {
          set.status = 401;
          return { error: 'Account Inactive', message: 'User account is no longer active' };
        }
  
        const tokens = generateAuthTokens({
          userId: tokenData.user.id,
          email: tokenData.user.email,
          role: tokenData.user.role,
          // TODO(tenant): read organizationId from user row once getRefreshTokenWithUser returns it
          organizationId: (tokenData.user as { organizationId?: string }).organizationId ?? '00000000-0000-0000-0000-000000000001',
        });
  
        // Revoke old token and issue new one (prevents session fixation)
        await userService.revokeRefreshToken(refreshToken);
        const refreshExpiry = new Date();
        const refreshSeconds = parseExpiryToSeconds(config.jwt.refreshTokenExpiry);
        refreshExpiry.setSeconds(refreshExpiry.getSeconds() + (refreshSeconds ?? 604800));
        await userService.createRefreshToken(
          tokenData.user.id,
          tokens.refreshToken,
          refreshExpiry
        );
  
        const cookieOptions = getAuthCookieOptions();
        const accessTokenMaxAge = parseExpiryToSeconds(config.jwt.accessTokenExpiry);
        const refreshTokenMaxAge = refreshSeconds;
  
        cookie['access_token'].set({
          value: tokens.accessToken,
          ...cookieOptions,
          ...(accessTokenMaxAge ? { maxAge: accessTokenMaxAge } : {}),
        });
        cookie['refresh_token'].set({
          value: tokens.refreshToken,
          ...cookieOptions,
          ...(refreshTokenMaxAge ? { maxAge: refreshTokenMaxAge } : {}),
        });
        return {
          success: true,
          meta: { timestamp: new Date() },
        };
      } catch {
        set.status = 401;
        return { error: 'Invalid Token', message: 'Refresh token is invalid or expired' };
      }
    }, {
      response: {
        200: t.Object({
          success: t.Literal(true),
          meta: t.Object({ timestamp: t.Any() }),
        }),
        401: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
      },
    })
  
    // POST /logout
    .post('/logout', async ({ body, set, headers, cookie, request }) => {
      try {
        const rawAccessToken =
          (headers.authorization?.startsWith('Bearer ') ? headers.authorization.substring(7) : undefined) ??
          (typeof cookie['access_token']?.value === 'string' ? cookie['access_token'].value : undefined);

        if (rawAccessToken) {
          const accessPayload = jwt.decode(rawAccessToken) as Record<string, unknown> | null;
          const jti = typeof accessPayload?.['jti'] === 'string' ? accessPayload['jti'] : null;
          const exp = typeof accessPayload?.['exp'] === 'number' ? accessPayload['exp'] : null;
          if (jti && exp) {
            const ttl = Math.max(exp - Math.floor(Date.now() / 1000), 1);
            const redisClient = await getRedisClient();
            if (redisClient) {
              // VERIFY-AT-RUNTIME: getRedisClient() returns IORedis | null; null means Redis not initialized yet
              await redisClient.setex(`revoked:${jti}`, ttl, '1');
            }
          }
        }

        const authUser = await getAuthUser(headers.authorization);
        const { userService, auditService } = await getServices();
        const bodyRecord: Record<string, unknown> = isRecord(body) ? body : {};
        const refreshToken = typeof bodyRecord.refreshToken === 'string' ? bodyRecord.refreshToken : undefined;
  
        if (refreshToken) {
          await userService.revokeRefreshToken(refreshToken);
        } else if (authUser?.id) {
          await userService.revokeAllRefreshTokens(authUser.id);
        }
  
        const cookieOptions = getAuthCookieOptions();
        cookie['access_token'].set({ value: '', ...cookieOptions, maxAge: 0 });
        cookie['refresh_token'].set({ value: '', ...cookieOptions, maxAge: 0 });
  
        await auditService.logSecurityEvent({
          eventType: AuditEventType.LOGOUT,
          userId: authUser?.id,
          details: { revokedAllTokens: !refreshToken },
          ipAddress: '',
          userAgent: getUserAgent(request, headers as Record<string, string | undefined> | undefined),
        });
  
        return {
          success: true,
          data: { message: 'Logout successful' },
          meta: { timestamp: new Date() },
        };
      } catch (error) {
        logger.error('Logout error', { error });
        set.status = 500;
        return { error: 'Internal Server Error', message: 'An error occurred during logout' };
      }
    }, {
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({ message: t.String() }),
          meta: t.Object({ timestamp: t.Any() }),
        }),
        500: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
      },
    })
  
    // POST /change-password (requires auth)
    .group('', (g) => // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
    withRequiredAuth(g).post('/change-password', async ({ body, set, user }) => {
      const parsed = changePasswordSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: 'Validation Error', details: parsed.error.flatten() };
      }
      try {
        const { userService, auditService } = await getServices();
        const account = await userService.findUserById(user!.id);
        if (!account) {
          set.status = 404;
          return { error: 'User Not Found', message: 'User account not found' };
        }
        if (!account.passwordHash) {
          set.status = 401;
          return { error: 'Authentication Failed', message: 'This account does not use password authentication' };
        }
        const isValid = await bcrypt.compare(parsed.data.currentPassword, account.passwordHash);
        if (!isValid) {
          await auditService.logSecurityEvent({
            eventType: AuditEventType.PASSWORD_CHANGE_FAILED,
            userId: user!.id,
            details: { email: account.email, reason: 'Invalid current password' },
            ipAddress: '',
            userAgent: '',
          });
          set.status = 401;
          return { error: 'Authentication Failed', message: 'Current password is incorrect' };
        }
      
        await userService.updatePassword(user!.id, parsed.data.newPassword);
        await userService.revokeAllRefreshTokens(user!.id);
      
        await auditService.logSecurityEvent({
          eventType: AuditEventType.PASSWORD_CHANGED,
          userId: user!.id,
          details: { email: account.email },
          ipAddress: '',
          userAgent: '',
        });
      
        return {
          message: 'Password changed successfully. Please log in again with your new password.',
        };
      } catch (error) {
        logger.error('Change password error', { error, userId: user?.id });
        set.status = 500;
        return {
          error: 'Internal Server Error',
          message: 'An error occurred while changing password',
        };
      }
    }, {
      body: t.Object({
        currentPassword: t.String({ minLength: 1 }),
        newPassword: t.String({ minLength: 8 }),
      }),
      response: {
        200: t.Object({ message: t.String() }),
        400: t.Object({ error: t.String(), details: t.Optional(t.Any()) }),
        401: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
        404: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
        500: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
      },
    })
    )
  
    // POST /subdomain-token — issue audience-restricted short-lived JWT for BFF subdomain pattern
    .group('', (g) => // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
    withRequiredAuth(g).post('/subdomain-token', async ({ body, set, user }) => {
      const parsed = subdomainTokenSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: 'Validation Error', details: parsed.error.flatten() };
      }

      try {
        const { subdomain } = parsed.data;

        const token = await signJWT(
          {
            userId: user!.id,
            email: user!.email,
            role: user!.role,
          },
          {
            audience: subdomain,
            issuer: 'tardis',
            expiresIn: '5m',
          },
        );

        return {
          success: true,
          data: {
            token,
            subdomain,
            expiresIn: 300, // 5 minutes in seconds
          },
        };
      } catch (error) {
        logger.error('Subdomain token generation error', { error, userId: user?.id });
        set.status = 500;
        return { error: 'Internal Server Error', message: 'Failed to generate subdomain token' };
      }
    }, {
      body: t.Object({
        subdomain: t.String({ minLength: 1 }),
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            token: t.String(),
            subdomain: t.String(),
            expiresIn: t.Number(),
          }),
        }),
        400: t.Object({ error: t.String(), details: t.Optional(t.Any()) }),
        500: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
      },
    })
    )

    // GET /me
    .group('', (g) => // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
    withRequiredAuth(g).get('/me', async ({ set, user }) => {
      try {
        const { userService } = await getServices();
        const account = await userService.findUserById(user!.id);
        if (!account) {
          set.status = 404;
          return {
            success: false,
            error: { code: 'USER_NOT_FOUND', message: 'User account not found' },
            meta: { timestamp: new Date() },
          };
        }
        return {
          success: true,
          data: {
            id: account.id,
            email: account.email,
            firstName: account.firstName || '',
            lastName: account.lastName || '',
            role: account.role,
            department: account.department || '',
            permissions: account.permissions || [],
            lastLoginAt: account.lastLoginAt,
          },
          meta: { timestamp: new Date() },
        };
      } catch {
        set.status = 500;
        return { error: 'Internal Server Error', message: 'Failed to load user' };
      }
    }, {
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            id: t.String(),
            email: t.String(),
            firstName: t.String(),
            lastName: t.String(),
            role: t.String(),
            department: t.String(),
            permissions: t.Array(t.Any()),
            lastLoginAt: t.Optional(t.Any()),
          }),
          meta: t.Object({ timestamp: t.Any() }),
        }),
        404: t.Object({
          success: t.Literal(false),
          error: t.Object({ code: t.String(), message: t.String() }),
          meta: t.Object({ timestamp: t.Any() }),
        }),
        500: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
      },
    })
    )
  
    // GET /csrf-token - Public endpoint
    .get('/csrf-token', ({ set, cookie }) => {
      try {
        const token = csrfProtection.generateToken();
  
        // Set cookie for browser access (needs httpOnly: false so JS can read it)
        const csrfCookieOptions = getAuthCookieOptions();
        cookie['csrf-token'].set({
          value: token,
          ...csrfCookieOptions,
          httpOnly: false,
          sameSite: 'strict' as const,
          maxAge: 3600,
        });
  
        return {
          success: true,
          data: {
            token,
            headerName: 'x-csrf-token',
          },
        };
      } catch (error) {
        logger.error('Error generating CSRF token:', error);
        set.status = 500;
        return {
          success: false,
          error: {
            code: 'CSRF_TOKEN_ERROR',
            message: 'Internal server error while generating CSRF token',
          },
        };
      }
    }, {
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({ token: t.String(), headerName: t.String() }),
        }),
        500: t.Object({
          success: t.Literal(false),
          error: t.Object({ code: t.String(), message: t.String() }),
        }),
      },
    })
  
    // GET /validate - Token validation for nginx auth_request
    .get('/validate', async ({ headers, set }) => {
      try {
        const authHeader = headers.authorization;
  
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          set.status = 401;
          return { error: 'No token provided' };
        }
  
        const token = authHeader.substring(7);
        const decoded = await JWTValidator.verify(token);
  
        // Set user info headers for nginx to forward to upstream services
        set.headers['X-User-ID'] = decoded.userId;
        set.headers['X-User-Email'] = decoded.email;
        set.headers['X-User-Role'] = decoded.role;
  
        return { valid: true };
      } catch (error) {
        logger.debug('Token validation failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        set.status = 401;
        return { error: 'Token validation failed' };
      }
    }, {
      response: {
        200: t.Object({ valid: t.Literal(true) }),
        401: t.Object({ error: t.String() }),
      },
    })
    // POST /internal-token - Issue internal service token
    .post('/internal-token', async ({ body, set }) => {
      const parsed = internalTokenSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: 'Validation Error', details: parsed.error.flatten() };
      }
      const { serviceName, apiKey, permissions: requestedPermissions, scopes: requestedScopes } = parsed.data;

      try {
        const { auditService } = await getServices();

        const validKey = await apiKeyAuth.validateAPIKey(apiKey);
        if (!validKey || validKey.serviceName !== serviceName) {
          set.status = 401;
          return { error: 'Invalid service credentials' };
        }

        // Use the API key's registered permissions/scopes.
        // If the request asks for a subset, intersect; never escalate beyond what the key allows.
        const keyPermissions = validKey.permissions ?? ['read'];
        const keyScopes = validKey.scopes ?? [`service:${serviceName.toLowerCase().replace(/\s+/g, '-')}`];

        const effectivePermissions = requestedPermissions
          ? requestedPermissions.filter((p) => keyPermissions.includes(p))
          : keyPermissions;
        const effectiveScopes = requestedScopes
          ? requestedScopes.filter((s) => keyScopes.includes(s))
          : keyScopes;

        // Generate internal token
        const expiresAt = Date.now() + 3600000; // 1 hour
        const internalToken = jwt.sign(
          {
            serviceId: serviceName.toLowerCase().replace(/\s+/g, '-'),
            serviceName,
            type: 'internal',
            permissions: effectivePermissions,
            scopes: effectiveScopes,
          },
          config.jwt.secret,
          { algorithm: 'HS256', expiresIn: '1h', issuer: 'uaip', audience: 'uaip-services' }
        );
  
        await auditService.logEvent({
          eventType: AuditEventType.TOKEN_REFRESH,
          userId: serviceName,
          resourceType: 'internal_token',
          resourceId: validKey.id,
          details: { serviceName },
        });
  
        return {
          success: true,
          data: {
            token: internalToken,
            expiresAt: new Date(expiresAt).toISOString(),
          },
        };
      } catch (error) {
        logger.error('Error generating internal token:', error);
        set.status = 500;
        return {
          success: false,
          error: {
            code: 'INTERNAL_TOKEN_ERROR',
            message: 'Internal server error while generating internal token',
          },
        };
      }
    }, {
      body: t.Object({
        serviceName: t.String({ minLength: 1 }),
        apiKey: t.String({ minLength: 1 }),
        permissions: t.Optional(t.Array(t.String())),
        scopes: t.Optional(t.Array(t.String())),
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({ token: t.String(), expiresAt: t.String() }),
        }),
        400: t.Object({ error: t.String(), details: t.Optional(t.Any()) }),
        401: t.Object({ error: t.String() }),
        500: t.Object({
          success: t.Literal(false),
          error: t.Object({ code: t.String(), message: t.String() }),
        }),
      },
    })

    .group('', (g) => // @ts-expect-error -- Elysia middleware injects user but TS cannot infer through nested groups
    withRequiredAuth(g).delete('/sessions/:sessionId', async ({ params, set, user }) => {
      const { sessionId } = params;
      try {
        const sessionService = SessionService.getInstance();
        const session = await sessionService.findSessionById(sessionId);

        if (!session) {
          set.status = 404;
          return { error: 'Not Found', message: 'Session not found' };
        }

        const isOwner = session.userId === user!.id;
        const isAdmin = user!.role === 'admin';

        if (!isOwner && !isAdmin) {
          set.status = 404;
          return { error: 'Not Found', message: 'Session not found' };
        }

        const redisClient = await getRedisClient();
        if (redisClient) {
          // VERIFY-AT-RUNTIME: getRedisClient() may return null if Redis is not yet initialized
          const sessionJti = typeof (session as Record<string, unknown>)['jti'] === 'string'
            ? (session as Record<string, unknown>)['jti'] as string
            : null;
          if (sessionJti) {
            const nowSec = Math.floor(Date.now() / 1000);
            const exp = typeof (session as Record<string, unknown>)['expiresAt'] === 'object'
              ? Math.floor((session.expiresAt as Date).getTime() / 1000)
              : null;
            const ttl = exp ? Math.max(exp - nowSec, 1) : 900;
            await redisClient.setex(`revoked:${sessionJti}`, ttl, '1');
          }
        }

        await sessionService.invalidateSession(session.sessionToken);

        return {
          success: true,
          data: { message: 'Session revoked successfully' },
          meta: { timestamp: new Date() },
        };
      } catch (error) {
        logger.error('Error revoking session', { error, sessionId, userId: user?.id });
        set.status = 500;
        return { error: 'Internal Server Error', message: 'An error occurred while revoking session' };
      }
    }, {
      params: t.Object({ sessionId: t.String() }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({ message: t.String() }),
          meta: t.Object({ timestamp: t.Any() }),
        }),
        404: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
        500: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
      },
    })
    )
  );

}

export default registerAuthRoutes;
