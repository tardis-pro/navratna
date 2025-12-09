import { z } from 'zod';
import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { UserService } from '@uaip/shared-services';
import { validateJWTToken } from '@uaip/middleware';
import { withOptionalAuth, withRequiredAuth } from './middleware/auth.plugin.js';
import { AuditService } from '../services/auditService.js';
import { AuditEventType } from '@uaip/types';

// Lazy singletons for dependent services
let userService: UserService | null = null;
let auditService: AuditService | null = null;

async function getServices() {
  if (!userService) {
    userService = UserService.getInstance();
  }
  if (!auditService) {
    auditService = new AuditService();
  }
  return { userService, auditService };
}

// Schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().default(false),
});

const refreshTokenSchema = z.object({
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

// Helpers
function generateTokens(userId: string, email: string, role: string) {
  const jwtSecret = config.jwt.secret as string;
  const refreshSecret = config.jwt.refreshSecret as string;

  if (!jwtSecret || !refreshSecret) {
    throw new Error('JWT secrets not configured');
  }

  const accessTokenPayload = { userId, email, role };
  const refreshTokenPayload = { userId, email, role, type: 'refresh' };

  const accessTokenOptions: SignOptions = { expiresIn: config.jwt.accessTokenExpiry || '15m' };
  const refreshTokenOptions: SignOptions = { expiresIn: config.jwt.refreshTokenExpiry || '7d' };

  const accessToken = jwt.sign(accessTokenPayload, jwtSecret, accessTokenOptions);
  const refreshToken = jwt.sign(refreshTokenPayload, refreshSecret, refreshTokenOptions);

  return { accessToken, refreshToken };
}

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

export function registerAuthRoutes(app: any): any {
  return app.group('/api/v1/auth', (app: any) =>
    withOptionalAuth(app)
      // POST /login
      .post('/login', async ({ body, set, request, headers }) => {
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
          const tokens = generateTokens(user.id, user.email, user.role);
          await userService.createRefreshToken(
            user.id,
            tokens.refreshToken,
            new Date(Date.now() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000))
          );

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
                permissions: user.permissions || [],
                lastLoginAt: user.lastLoginAt,
              },
              tokens: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresIn: config.jwt.accessTokenExpiry || '15m',
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
      .post('/refresh', async ({ body, set }) => {
        const parsed = refreshTokenSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { error: 'Validation Error', details: parsed.error.flatten() };
        }
        const { refreshToken } = parsed.data;
        try {
          const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;
          const { userService } = await getServices();
          const tokenData = await userService.getRefreshTokenWithUser(refreshToken);
          if (!tokenData || tokenData.revokedAt || tokenData.expiresAt <= new Date()) {
            set.status = 401;
            return { error: 'Invalid Token', message: 'Refresh token not found or expired' };
          }
          if (!tokenData.user.isActive) {
            set.status = 401;
            return { error: 'Account Inactive', message: 'User account is no longer active' };
          }

          const tokens = generateTokens(
            tokenData.user.id,
            tokenData.user.email,
            tokenData.user.role
          );
          return {
            success: true,
            data: {
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              expiresIn: config.jwt.accessTokenExpiry || '15m',
            },
            meta: { timestamp: new Date() },
          };
        } catch (e) {
          set.status = 401;
          return { error: 'Invalid Token', message: 'Refresh token is invalid or expired' };
        }
      })

      // POST /logout
      .post('/logout', async ({ body, set, headers }) => {
        try {
          const authUser = await getAuthUser(headers.authorization);
          const { userService, auditService } = await getServices();
          const refreshToken = (body as any)?.refreshToken as string | undefined;

          if (refreshToken) {
            await userService.revokeRefreshToken(refreshToken);
          } else if (authUser?.id) {
            await userService.revokeAllRefreshTokens(authUser.id);
          }

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
      .group('', (g: any) =>
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
      .group('', (g: any) =>
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
          } catch (error) {
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to load user' };
          }
        })
      )
  );
}

export default registerAuthRoutes;
