import express, { Router } from 'express';
import { Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';
import { DatabaseService } from '@uaip/shared-services';
import { AuditService } from '../services/auditService.js';
import { authMiddleware, requireAdmin } from '@uaip/middleware';
import { validateRequest } from '@uaip/middleware';
import { AuditEventType } from '@uaip/types';

const router: Router = express.Router();
const databaseService = new DatabaseService();
const auditService = new AuditService(databaseService);

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
const generateTokens = (userId: string, email: string, role: string) => {
  const jwtSecret = config.jwt.secret as string;
  const refreshSecret = config.jwt.refreshSecret as string;
  
  if (!jwtSecret || !refreshSecret) {
    throw new Error('JWT secrets not configured');
  }

  const accessTokenPayload = { userId, email, role };
  const accessTokenOptions: SignOptions = { expiresIn: config.jwt.accessTokenExpiry || '15m' };
  const accessToken = jwt.sign(accessTokenPayload, jwtSecret, accessTokenOptions);

  const refreshTokenPayload = { userId, email, type: 'refresh' };
  const refreshTokenOptions: SignOptions = { expiresIn: config.jwt.refreshTokenExpiry || '7d' };
  const refreshToken = jwt.sign(refreshTokenPayload, refreshSecret, refreshTokenOptions);

  return { accessToken, refreshToken };
};

const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
};

const verifyPassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

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

      // Find user in database
      const query = `
        SELECT id, email, password_hash, role, is_active, failed_login_attempts, 
               locked_until, last_login_at, created_at
        FROM users 
        WHERE email = $1
      `;
      
      const resultUser = await databaseService.query(query, [email]);
      
      if (resultUser.rows.length === 0) {
        await auditService.logSecurityEvent({
          eventType: AuditEventType.LOGIN_FAILED,
          userId: undefined,
          details: { email, reason: 'User not found' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });

        return res.status(401).json({
          error: 'Authentication Failed',
          message: 'Invalid email or password'
        });
      }

      const user = resultUser.rows[0];

      // Check if account is active
      if (!user.is_active) {
        await auditService.logSecurityEvent({
          eventType: AuditEventType.LOGIN_FAILED,
          userId: user.id,
          details: { email, reason: 'Account inactive' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });

        return res.status(401).json({
          error: 'Authentication Failed',
          message: 'Account is inactive'
        });
      }

      // Check if account is locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        await auditService.logSecurityEvent({
          eventType: AuditEventType.LOGIN_FAILED,
          userId: user.id,
          details: { email, reason: 'Account locked' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });

        return res.status(401).json({
          error: 'Authentication Failed',
          message: 'Account is temporarily locked due to multiple failed login attempts'
        });
      }

      // Verify password
      const isValidPassword = await verifyPassword(password, user.password_hash);
      
      if (!isValidPassword) {
        // Increment failed login attempts
        const failedAttempts = (user.failed_login_attempts || 0) + 1;
        const maxAttempts = 5;
        const lockDuration = 30 * 60 * 1000; // 30 minutes

        let updateQuery = `
          UPDATE users 
          SET failed_login_attempts = $1, updated_at = NOW()
        `;
        let updateParams = [failedAttempts, user.id];

        if (failedAttempts >= maxAttempts) {
          updateQuery = `
            UPDATE users 
            SET failed_login_attempts = $1, locked_until = $2, updated_at = NOW()
            WHERE id = $3
          `;
          updateParams = [failedAttempts, new Date(Date.now() + lockDuration), user.id];
        } else {
          updateQuery += ' WHERE id = $2';
        }

        await databaseService.query(updateQuery, updateParams);

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

        return res.status(401).json({
          error: 'Authentication Failed',
          message: 'Invalid email or password'
        });
      }

      // Successful login - reset failed attempts and update last login
      await databaseService.query(`
        UPDATE users 
        SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [user.id]);

      // Generate tokens
      const tokens = generateTokens(user.id, user.email, user.role);

      // Store refresh token in database
      await databaseService.query(`
        INSERT INTO refresh_tokens (user_id, token, expires_at, created_at)
        VALUES ($1, $2, $3, NOW())
      `, [
        user.id,
        tokens.refreshToken,
        new Date(Date.now() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)) // 30 days if remember me, 7 days otherwise
      ]);

      await auditService.logSecurityEvent({
        eventType: AuditEventType.LOGIN_SUCCESS,
        userId: user.id,
        details: { email, rememberMe },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          lastLoginAt: user.last_login_at
        },
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: config.jwt.accessTokenExpiry || '15m'
        }
      });

    } catch (error) {
      logger.error('Login error', { error, email: req.body.email });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An error occurred during login'
      });
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
        return res.status(401).json({
          error: 'Invalid Token',
          message: 'Refresh token is invalid or expired'
        });
      }

      // Check if refresh token exists in database
      const tokenQuery = `
        SELECT rt.*, u.email, u.role, u.is_active
        FROM refresh_tokens rt
        JOIN users u ON rt.user_id = u.id
        WHERE rt.token = $1 AND rt.expires_at > NOW() AND rt.revoked_at IS NULL
      `;
      
      const tokenResult = await databaseService.query(tokenQuery, [refreshToken]);
      
      if (tokenResult.rows.length === 0) {
        return res.status(401).json({
          error: 'Invalid Token',
          message: 'Refresh token not found or expired'
        });
      }

      const tokenData = tokenResult.rows[0];

      // Check if user is still active
      if (!tokenData.is_active) {
        return res.status(401).json({
          error: 'Account Inactive',
          message: 'User account is no longer active'
        });
      }

      // Generate new access token
      const jwtSecret = config.jwt.secret as string;
      if (!jwtSecret) {
        throw new Error('JWT secret not configured');
      }

      const newTokenPayload = { userId: decoded.userId, email: decoded.email, role: tokenData.role };
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
        message: 'Token refreshed successfully',
        accessToken: newAccessToken,
        expiresIn: config.jwt.accessTokenExpiry || '15m'
      });

    } catch (error) {
      logger.error('Token refresh error', { error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An error occurred during token refresh'
      });
    }
  });

/**
 * @route POST /api/v1/auth/logout
 * @desc Logout user and revoke refresh token
 * @access Private
 */
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const userId = (req as any).user.id;

    if (refreshToken) {
      // Revoke the specific refresh token
      await databaseService.query(`
        UPDATE refresh_tokens 
        SET revoked_at = NOW() 
        WHERE token = $1 AND user_id = $2
      `, [refreshToken, userId]);
    } else {
      // Revoke all refresh tokens for the user
      await databaseService.query(`
        UPDATE refresh_tokens 
        SET revoked_at = NOW() 
        WHERE user_id = $1 AND revoked_at IS NULL
      `, [userId]);
    }

    await auditService.logSecurityEvent({
      eventType: AuditEventType.LOGOUT,
      userId,
      details: { revokedAllTokens: !refreshToken },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      message: 'Logout successful'
    });

  } catch (error) {
    logger.error('Logout error', { error, userId: (req as any).user?.id });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred during logout'
    });
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

      // Get current password hash
      const userQuery = `SELECT password_hash FROM users WHERE id = $1`;
      const userResult = await databaseService.query(userQuery, [userId]);
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({
          error: 'User Not Found',
          message: 'User account not found'
        });
      }

      const user = userResult.rows[0];

      // Verify current password
      const isValidPassword = await verifyPassword(currentPassword, user.password_hash);
      if (!isValidPassword) {
        await auditService.logSecurityEvent({
          eventType: AuditEventType.PASSWORD_CHANGE_FAILED,
          userId,
          details: { email: user.email, reason: 'Invalid current password' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });

        return res.status(401).json({
          error: 'Authentication Failed',
          message: 'Current password is incorrect'
        });
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);

      // Update password
      await databaseService.query(`
        UPDATE users 
        SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `, [newPasswordHash, userId]);

      // Revoke all refresh tokens to force re-login
      await databaseService.query(`
        UPDATE refresh_tokens 
        SET revoked_at = NOW() 
        WHERE user_id = $1 AND revoked_at IS NULL
      `, [userId]);

      await auditService.logSecurityEvent({
        eventType: AuditEventType.PASSWORD_CHANGED,
        userId,
        details: { email: user.email },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        message: 'Password changed successfully. Please log in again.'
      });

    } catch (error) {
      logger.error('Change password error', { error, userId: (req as any).user?.id });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An error occurred while changing password'
      });
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

    const userQuery = `
      SELECT id, email, role, is_active, created_at, last_login_at, password_changed_at
      FROM users 
      WHERE id = $1
    `;
    
    const result = await databaseService.query(userQuery, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User account not found'
      });
    }

    const user = result.rows[0];

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
        passwordChangedAt: user.password_changed_at
      }
    });

  } catch (error) {
    logger.error('Get user info error', { error, userId: (req as any).user?.id });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while fetching user information'
    });
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

      // Check if user exists
      const userQuery = `SELECT id, email FROM users WHERE email = $1 AND is_active = true`;
      const userResult = await databaseService.query(userQuery, [email]);

      // Always return success to prevent email enumeration
      res.json({
        message: 'If an account with that email exists, a password reset link has been sent.'
      });

      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        
        // Generate reset token
        const resetToken = jwt.sign(
          { userId: user.id, email: user.email, type: 'password_reset' },
          config.jwt.secret,
          { expiresIn: '1h' }
        );

        // Store reset token in database
        await databaseService.query(`
          INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at)
          VALUES ($1, $2, $3, NOW())
        `, [user.id, resetToken, new Date(Date.now() + 60 * 60 * 1000)]); // 1 hour

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
    }
  });

export default router; 