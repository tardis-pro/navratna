import type { AnyElysia } from 'elysia';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { UserService } from '@uaip/shared-services';
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
} from '@uaip/middleware';
// Note: All auth utilities now from shared middleware
import { AuditService } from '../services/audit_service.js';
import { AuditEventType } from '@uaip/types';

// Lazy singletons for dependent services
let userServiceSingleton: UserService | null = null;
let auditServiceSingleton: AuditService | null = null;

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
  sameSite: 'lax' as const,
  path: '/',
});

async function getServices() {
  if (!userServiceSingleton) {
    userServiceSingleton = UserService.getInstance();
  }
  if (!auditServiceSingleton) {
    auditServiceSingleton = new AuditService();
  }
  return { userService: userServiceSingleton, auditService: auditServiceSingleton };
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

const internalTokenSchema = z.object({
  serviceName: z.string().min(1, 'Service name is required'),
  apiKey: z.string().min(1, 'API key is required'),
});

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
const RATE_LIMITED_AUTH_PATHS = new Set(['/login', '/refresh', '/change-password', '/logout']);
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

export function registerAuthRoutes(elysiaApp: AnyElysia): AnyElysia {
  return elysiaApp.group('/api/v1/auth', (app: AnyElysia) =>
    withOptionalAuth(app)
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
              userAgent: headers['user-agent'],
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
              userAgent: headers['user-agent'],
            });
            set.status = 401;
            return { error: 'Authentication Failed', message: 'Account is inactive' };
          }

          // Account lock check
          // @ts-expect-error -- Property does not exist on inferred type
          if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
            await auditService.logSecurityEvent({
              eventType: AuditEventType.LOGIN_FAILED,
              userId: user.id,
              details: { email, reason: 'Account locked' },
              ipAddress: request.headers.get('x-forwarded-for') || '',
              userAgent: headers['user-agent'],
            });
            set.status = 401;
            return {
              error: 'Authentication Failed',
              message: 'Account is temporarily locked due to multiple failed login attempts',
            };
          }

          const isValidPassword = await bcrypt.compare(password, user.passwordHash);
          if (!isValidPassword) {
            // @ts-expect-error -- Property does not exist on inferred type
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
              userAgent: headers['user-agent'],
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
          });
          await userService.createRefreshToken(
            user.id,
            tokens.refreshToken,
            new Date(Date.now() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000))
          );

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

          await auditService.logSecurityEvent({
            eventType: AuditEventType.LOGIN_SUCCESS,
            userId: user.id,
            details: { email, rememberMe },
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: headers['user-agent'],
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
                // @ts-expect-error -- Property does not exist on inferred type
                permissions: user.permissions || [],
                // @ts-expect-error -- Property does not exist on inferred type
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
      })

      // POST /refresh
      .post('/refresh', async ({ set, cookie }) => {
        const refreshToken = cookie['refresh_token']?.value as string | undefined;
        if (!refreshToken) {
          set.status = 401;
          return { error: 'Unauthorized', message: 'No refresh token provided' };
        }
        try {
          // Verify refresh token signature (throws on invalid/expired)
          jwt.verify(refreshToken, config.jwt.refreshSecret);
          const { userService } = await getServices();
          const tokenData = await userService.getRefreshTokenWithUser(refreshToken);
          // @ts-expect-error -- Property does not exist on inferred type
          if (!tokenData || tokenData.revokedAt || tokenData.expiresAt <= new Date()) {
            set.status = 401;
            return { error: 'Invalid Token', message: 'Refresh token not found or expired' };
          }
          // @ts-expect-error -- Property does not exist on inferred type
          if (!tokenData.user.isActive) {
            set.status = 401;
            return { error: 'Account Inactive', message: 'User account is no longer active' };
          }

          const tokens = generateAuthTokens({
            // @ts-expect-error -- Property does not exist on inferred type
            userId: tokenData.user.id,
            // @ts-expect-error -- Property does not exist on inferred type
            email: tokenData.user.email,
            // @ts-expect-error -- Property does not exist on inferred type
            role: tokenData.user.role,
          });

          // Revoke old token and issue new one (prevents session fixation)
          await userService.revokeRefreshToken(refreshToken);
          const refreshExpiry = new Date();
          const refreshSeconds = parseExpiryToSeconds(config.jwt.refreshTokenExpiry);
          refreshExpiry.setSeconds(refreshExpiry.getSeconds() + (refreshSeconds ?? 604800));
          await userService.createRefreshToken(
            // @ts-expect-error -- Property does not exist on inferred type
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
      })

      // POST /logout
      .post('/logout', async ({ body, set, headers, cookie }) => {
        try {
          const authUser = await getAuthUser(headers.authorization);
          const { userService, auditService } = await getServices();
          // @ts-expect-error -- Property does not exist on inferred type
          const refreshToken = (body as unknown)?.refreshToken as string | undefined;

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
            userAgent: headers['user-agent'],
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
      })

      // POST /change-password (requires auth)
      .group('', (g: AnyElysia) =>
        // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
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
        })
      )

      // GET /me
      .group('', (g: AnyElysia) =>
        // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
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
                // @ts-expect-error -- Property does not exist on inferred type
                permissions: account.permissions || [],
                // @ts-expect-error -- Property does not exist on inferred type
                lastLoginAt: account.lastLoginAt,
              },
              meta: { timestamp: new Date() },
            };
          } catch {
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to load user' };
          }
        })
      )

      // GET /csrf-token - Public endpoint
      .get('/csrf-token', ({ set, cookie }) => {
        try {
          const token = csrfProtection.generateToken();

          // Set cookie for browser access
          cookie['csrf-token'].set({
            value: token,
            httpOnly: false,
            sameSite: 'strict',
            maxAge: 3600,
            path: '/',
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
      })

      // GET /validate - Token validation for nginx auth_request
      .get('/validate', ({ headers, set }) => {
        try {
          const authHeader = headers.authorization;

          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            set.status = 401;
            return { error: 'No token provided' };
          }

          const token = authHeader.substring(7);
          const decoded = JWTValidator.verify(token);

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
      })
      // POST /internal-token - Issue internal service token
      .post('/internal-token', async ({ body, set }) => {
        const parsed = internalTokenSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { error: 'Validation Error', details: parsed.error.flatten() };
        }
        const { serviceName, apiKey } = parsed.data;

        try {
          const { auditService } = await getServices();

          const validKey = await apiKeyAuth.validateAPIKey(apiKey);
          if (!validKey || validKey.serviceName !== serviceName) {
            set.status = 401;
            return { error: 'Invalid service credentials' };
          }

          // Generate internal token
          const expiresAt = Date.now() + 3600000; // 1 hour
          const internalToken = jwt.sign(
            {
              serviceId: serviceName.toLowerCase().replace(/\s+/g, '-'),
              serviceName,
              type: 'internal',
              permissions: ['read', 'write', 'execute'],
              scopes: [`service:${serviceName.toLowerCase().replace(/\s+/g, '-')}`],
            },
            config.jwt.secret,
            { expiresIn: '1h' }
          );

          await auditService.logEvent({
            eventType: 'internal_token_issued' as AuditEventType,
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
      })
  );
}

export default registerAuthRoutes;
