import express, { Router } from '@uaip/shared-services';
import { Request, Response } from '@uaip/shared-services';
import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';
import { UserService } from '@uaip/shared-services';
import { authMiddleware, requireAdmin, csrfProtection } from '@uaip/middleware';
import { validateRequest } from '@uaip/middleware';
import { AuditEventType } from '@uaip/types';
import { AuditService } from '../services/auditService.js';
// import { DefaultUserLLMProviderSeed } from '@uaip/shared-services/database/seeders/DefaultUserLLMProviderSeed.js';

const router = Router();

// Lazy initialization of services
let userService: UserService | null = null;
let auditService: AuditService | null = null;

async function getServices() {
  if (!userService) {
    userService = UserService.getInstance();
    auditService = new AuditService();
  }
  return { userService, auditService: auditService! };
}

// Validation schemas using Zod
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().default(false)
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
    ),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format')
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
    ),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

// Helper functions
async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

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

// Routes

/**
 * @route POST /api/v1/auth/login
 * @desc Authenticate user and return JWT tokens
 * @access Public
 */
router.post('/login',
  validateRequest({ body: loginSchema }),
  async (req, res) => {
    try {
      const { email, password, rememberMe } = req.body;

      // Find user in database using TypeORM
      const { userService, auditService } = await getServices();
      const user = await userService.findUserByEmail(email);

      if (!user) {
        await auditService.logSecurityEvent({
          eventType: AuditEventType.LOGIN_FAILED,
          userId: undefined,
          details: { email, reason: 'User not found' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });

        res.status(401).json({
          error: 'Authentication Failed',
          message: 'Invalid email or password'
        });
        return;
      }

      // Check if account is active
      if (!user.isActive) {
        await auditService.logSecurityEvent({
          eventType: AuditEventType.LOGIN_FAILED,
          userId: user.id,
          details: { email, reason: 'Account inactive' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });

        res.status(401).json({
          error: 'Authentication Failed',
          message: 'Account is inactive'
        });
        return;
      }

      // Check if account is locked
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        await auditService.logSecurityEvent({
          eventType: AuditEventType.LOGIN_FAILED,
          userId: user.id,
          details: { email, reason: 'Account locked' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });

        res.status(401).json({
          error: 'Authentication Failed',
          message: 'Account is temporarily locked due to multiple failed login attempts'
        });
        return;
      }

      // Verify password
      const isValidPassword = await verifyPassword(password, user.passwordHash);

      if (!isValidPassword) {
        // Increment failed login attempts
        const failedAttempts = (user.failedLoginAttempts) + 1;
        const maxAttempts = 5;
        const lockDuration = 30 * 60 * 1000; // 30 minutes

        if (failedAttempts >= maxAttempts) {
          // Lock account
          await userService.updateLoginTracking(user.id, {
            failedLoginAttempts: failedAttempts,
            lockedUntil: new Date(Date.now() + lockDuration)
          });
        } else {
          // Just increment failed attempts
          await userService.updateLoginTracking(user.id, {
            failedLoginAttempts: failedAttempts
          });
        }

        await auditService.logSecurityEvent({
          eventType: AuditEventType.LOGIN_FAILED,
          userId: user.id,
          details: {
            email,
            reason: 'Invalid password',
            failedAttempts,
            accountLocked: failedAttempts >= maxAttempts
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });

        res.status(401).json({
          error: 'Authentication Failed',
          message: 'Invalid email or password'
        });
        return;
      }

      // Successful login - reset failed attempts and update last login
      await userService.resetLoginAttempts(user.id);

      // Generate tokens
      const tokens = generateTokens(user.id, user.email, user.role);

      // Store refresh token in database using TypeORM
      await userService.createRefreshToken(
        user.id,
        tokens.refreshToken,
        new Date(Date.now() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)) // 30 days if remember me, 7 days otherwise
      );

      await auditService.logSecurityEvent({
        eventType: AuditEventType.LOGIN_SUCCESS,
        userId: user.id,
        details: { email, rememberMe },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      // Create default LLM providers for new users (fire and forget)
      // const { DefaultUserLLMProviderSeed, DatabaseService } = await import('@uaip/shared-services');
      // const databaseService = DatabaseService.getInstance();
      // DefaultUserLLMProviderSeed.createDefaultProvidersForUser(
      //   databaseService.dataSource,
      //   user.id,
      //   user.role
      // ).catch(error => {
      //   logger.warn('Failed to create default LLM providers for user', {
      //     error,
      //     userId: user.id
      //   });
      // });

      res.json({
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
            lastLoginAt: user.lastLoginAt
          },
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: config.jwt.accessTokenExpiry || '15m'
          }
        },
        meta: {
          timestamp: new Date()
        }
      });

    } catch (error) {
      logger.error('Login error', { error, email: req.body.email });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An error occurred during login'
      });
      return;
    }
  });

/**
 * @route POST /api/v1/auth/refresh
 * @desc Refresh access token using refresh token
 * @access Public
 */
router.post('/refresh',
  validateRequest({ body: refreshTokenSchema }),
  async (req, res) => {
    try {
      const { refreshToken } = req.body;

      // Verify refresh token
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;
      } catch (jwtError) {
        res.status(401).json({
          error: 'Invalid Token',
          message: 'Refresh token is invalid or expired'
        });
        return;
        return;
      }

      // Check if refresh token exists in database using TypeORM
      const { userService, auditService } = await getServices();
      const tokenData = await userService.getRefreshTokenWithUser(refreshToken);

      if (!tokenData || tokenData.revokedAt || tokenData.expiresAt <= new Date()) {
        res.status(401).json({
          error: 'Invalid Token',
          message: 'Refresh token not found or expired'
        });
        return;
        return;
      }

      // Check if user is still active
      if (!tokenData.user.isActive) {
        res.status(401).json({
          error: 'Account Inactive',
          message: 'User account is no longer active'
        });
        return;
        return;
      }

      // Generate new access token
      const jwtSecret = config.jwt.secret as string;
      if (!jwtSecret) {
        throw new Error('JWT secret not configured');
      }

      const newTokenPayload = { userId: decoded.userId, email: decoded.email, role: tokenData.user.role };
      const newTokenOptions: SignOptions = { expiresIn: config.jwt.accessTokenExpiry || '15m' };
      const newAccessToken = jwt.sign(newTokenPayload, jwtSecret, newTokenOptions);

      await auditService.logSecurityEvent({
        eventType: AuditEventType.TOKEN_REFRESH,
        userId: decoded.userId,
        details: { email: decoded.email },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        success: true,
        data: {
          tokens: {
            accessToken: newAccessToken,
            expiresIn: config.jwt.accessTokenExpiry || '15m'
          }
        },
        meta: {
          timestamp: new Date()
        }
      });

    } catch (error) {
      logger.error('Token refresh error', { error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An error occurred during token refresh'
      });
      return;
      return;
    }
  });

/**
 * @route POST /api/v1/auth/logout
 * @desc Logout user and revoke refresh token
 * @access Private
 */
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { userService, auditService } = await getServices();
    const { refreshToken } = req.body;
    const userId = (req as any).user.id;

    if (refreshToken) {
      // Revoke the specific refresh token using TypeORM
      await userService.revokeRefreshToken(refreshToken);
    } else {
      // Revoke all refresh tokens for the user using TypeORM
      await userService.revokeAllRefreshTokens(userId);
    }

    await auditService.logSecurityEvent({
      eventType: AuditEventType.LOGOUT,
      userId,
      details: { revokedAllTokens: !refreshToken },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: {
        message: 'Logout successful'
      },
      meta: {
        timestamp: new Date()
      }
    });

  } catch (error) {
    logger.error('Logout error', { error, userId: (req as any).user?.id });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred during logout'
    });
    return;
    return;
  }
});

/**
 * @route POST /api/v1/auth/change-password
 * @desc Change user password
 * @access Private
 */
router.post('/change-password',
  authMiddleware,
  validateRequest({ body: changePasswordSchema }),
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = (req as any).user.id;

      // Get current user using TypeORM
      const { userService, auditService } = await getServices();
      const user = await userService.findUserById(userId);

      if (!user) {
        res.status(404).json({
          error: 'User Not Found',
          message: 'User account not found'
        });
        return;
        return;
      }

      // Verify current password
      const isValidPassword = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValidPassword) {
        await auditService.logSecurityEvent({
          eventType: AuditEventType.PASSWORD_CHANGE_FAILED,
          userId,
          details: { email: user.email, reason: 'Invalid current password' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });

        res.status(401).json({
          error: 'Authentication Failed',
          message: 'Current password is incorrect'
        });
        return;
        return;
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);

      // Update password using TypeORM
      await userService.updatePassword(userId, newPassword);

      // Revoke all refresh tokens to force re-login using TypeORM
      await userService.revokeAllRefreshTokens(userId);

      await auditService.logSecurityEvent({
        eventType: AuditEventType.PASSWORD_CHANGED,
        userId,
        details: { email: user.email },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        message: 'Password changed successfully. Please log in again with your new password.'
      });

    } catch (error) {
      logger.error('Change password error', { error, userId: (req as any).user?.id });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An error occurred while changing password'
      });
      return;
      return;
    }
  });

/**
 * @route GET /api/v1/auth/me
 * @desc Get current user information
 * @access Private
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    // Get user using TypeORM
    const { userService, auditService } = await getServices();
    const user = await userService.findUserById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account not found'
        },
        meta: {
          timestamp: new Date()
        }
      });
      return;
      return;
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        role: user.role,
        department: user.department || '',
        permissions: user.permissions || [],
        isActive: user.isActive,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        passwordChangedAt: user.passwordChangedAt
      },
      meta: {
        timestamp: new Date()
      }
    });

  } catch (error) {
    logger.error('Get user info error', { error, userId: (req as any).user?.id });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while fetching user information'
      },
      meta: {
        timestamp: new Date()
      }
    });
    return;
    return;
  }
});

/**
 * @route POST /api/v1/auth/forgot-password
 * @desc Send password reset email
 * @access Public
 */
router.post('/forgot-password',
  validateRequest({ body: forgotPasswordSchema }),
  async (req, res) => {
    try {
      const { email } = req.body;

      // Check if user exists using TypeORM
      const { userService, auditService } = await getServices();
      const user = await userService.findUserByEmail(email);

      // Always return success to prevent email enumeration
      res.json({
        message: 'If an account with that email exists, a password reset link has been sent.'
      });

      if (user && user.isActive) {
        // Generate reset token
        const resetToken = jwt.sign(
          { userId: user.id, email: user.email, type: 'password_reset' },
          config.jwt.secret,
          { expiresIn: '1h' }
        );

        // Store reset token in database using TypeORM
        await userService.createPasswordResetToken(user.id);

        await auditService.logSecurityEvent({
          eventType: AuditEventType.PASSWORD_RESET_REQUESTED,
          userId: user.id,
          details: { email: user.email },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });

        // TODO: Send email with reset link
        // This would integrate with the NotificationService
        logger.info('Password reset requested', { userId: user.id, email });
      }

    } catch (error) {
      logger.error('Forgot password error', { error, email: req.body.email });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An error occurred while processing password reset request'
      });
      return;
      return;
    }
  });

/**
 * @route POST /api/v1/auth/reset-password
 * @desc Reset password using reset token
 * @access Public
 */
router.post('/reset-password',
  validateRequest({ body: resetPasswordSchema }),
  async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      // Verify reset token
      let decoded;
      try {
        decoded = jwt.verify(token, config.jwt.secret) as any;
      } catch (jwtError) {
        res.status(401).json({
          error: 'Invalid Token',
          message: 'Reset token is invalid or expired'
        });
        return;
        return;
      }

      // Check if reset token exists in database using TypeORM
      const { userService, auditService } = await getServices();
      const resetTokenData = await userService.getPasswordResetTokenWithUser(token);

      if (!resetTokenData || resetTokenData.usedAt || resetTokenData.expiresAt <= new Date()) {
        res.status(401).json({
          error: 'Invalid Token',
          message: 'Reset token not found, expired, or already used'
        });
        return;
        return;
      }

      // Check if user is still active
      if (!resetTokenData.user.isActive) {
        res.status(401).json({
          error: 'Account Inactive',
          message: 'User account is no longer active'
        });
        return;
        return;
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);

      // Update password using TypeORM
      await userService.updatePassword(resetTokenData.userId, newPassword);

      // Mark reset token as used using TypeORM
      await userService.markPasswordResetTokenAsUsed(token);

      // Revoke all refresh tokens to force re-login using TypeORM
      await userService.revokeAllRefreshTokens(resetTokenData.userId);

      await auditService.logSecurityEvent({
        eventType: AuditEventType.PASSWORD_CHANGED,
        userId: resetTokenData.userId,
        details: { email: resetTokenData.user.email, method: 'password_reset' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        message: 'Password reset successfully. Please log in with your new password.'
      });

    } catch (error) {
      logger.error('Reset password error', { error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An error occurred while resetting password'
      });
      return;
      return;
    }
  });

/**
 * @route GET /api/v1/auth/csrf-token
 * @desc Get CSRF token for client
 * @access Public
 */
router.get('/csrf-token', csrfProtection.tokenEndpoint());

// Note: CSRF protection temporarily disabled for testing
// Will be re-enabled after route registration is confirmed working

export default router; 