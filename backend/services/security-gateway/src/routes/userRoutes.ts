import express, { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { logger } from '@uaip/utils/src/logger';
import { authMiddleware, requireAdmin } from '@uaip/middleware';
import { validateRequest } from '@uaip/middleware';
import { AuditService } from '@/services/auditService.js';
import { NotificationService } from '@/services/notificationService.js';
import { DatabaseService } from '@uaip/shared-services';
import { Request, Response } from 'express';
import { config } from '@uaip/config';
import { AuditEventType } from '@uaip/types';

const router: Router = express.Router();
const databaseService = new DatabaseService();
const auditService = new AuditService(databaseService);
const notificationService = new NotificationService();

// Validation schemas using Zod
const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
    ),
  role: z.enum(['user', 'admin', 'security_admin', 'auditor']).default('user'),
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  department: z.string().max(100).optional(),
  isActive: z.boolean().default(true),
  sendWelcomeEmail: z.boolean().default(true)
});

const updateUserSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  role: z.enum(['user', 'admin', 'security_admin', 'auditor']).optional(),
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  department: z.string().max(100).optional(),
  isActive: z.boolean().optional()
});

const userQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(['user', 'admin', 'security_admin', 'auditor']).optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['created_at', 'email', 'role', 'last_login_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

const resetPasswordSchema = z.object({
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
    ),
  sendNotification: z.boolean().default(true)
});

const bulkActionSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['activate', 'deactivate', 'delete', 'reset_password']),
  reason: z.string().max(500).optional()
});

// Helper function for Zod validation
const validateWithZod = (schema: z.ZodSchema, data: any) => {
  const result = schema.safeParse(data);
  if (result.success) {
    return { error: null, value: result.data };
  } else {
    return {
      error: {
        details: result.error.errors.map(err => ({
          message: err.message,
          path: err.path.join('.')
        }))
      },
      value: null
    };
  }
};

// Helper functions
const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
};

const generateRandomPassword = (): string => {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@$!%*?&';
  let password = '';
  
  // Ensure at least one character from each required category
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // lowercase
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // uppercase
  password += '0123456789'[Math.floor(Math.random() * 10)]; // digit
  password += '@$!%*?&'[Math.floor(Math.random() * 7)]; // special character
  
  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

// Routes

/**
 * @route GET /api/v1/users
 * @desc Get all users with filtering and pagination
 * @access Private - Admin/Security roles only
 */
router.get('/', 
  authMiddleware,
  requireAdmin,
  validateRequest({ query: userQuerySchema }),
  async (req, res) => {
    try {
      const {
        page,
        limit,
        role,
        isActive,
        search,
        sortBy,
        sortOrder
      } = req.query;

      // Build query
      let query = `
        SELECT 
          id,
          email,
          role,
          first_name,
          last_name,
          department,
          is_active,
          created_at,
          updated_at,
          last_login_at,
          failed_login_attempts,
          locked_until
        FROM users
        WHERE 1=1
      `;

      const params: any[] = [];
      let paramCount = 0;

      // Add filters
      if (role) {
        paramCount++;
        query += ` AND role = $${paramCount}`;
        params.push(role);
      }

      if (isActive !== undefined) {
        paramCount++;
        query += ` AND is_active = $${paramCount}`;
        params.push(isActive);
      }

      if (search) {
        paramCount++;
        query += ` AND (email ILIKE $${paramCount} OR first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount} OR department ILIKE $${paramCount})`;
        params.push(`%${search}%`);
      }

      // Parse and validate query parameters
      const sortByQuery = sortBy as string || 'created_at';
      const sortOrderQuery = sortOrder as string || 'desc';
      const pageQuery = parseInt(page as string) || 1;
      const limitQuery = parseInt(limit as string) || 20;

      // Validate sort order
      const validSortOrder = ['asc', 'desc'].includes(sortOrderQuery.toLowerCase()) ? sortOrderQuery : 'desc';

      if (sortByQuery) {
        query += ` ORDER BY ${sortByQuery} ${validSortOrder.toUpperCase()}`;
      }

      if (pageQuery && limitQuery) {
        const offset = (pageQuery - 1) * limitQuery;
        query += ` LIMIT ${limitQuery} OFFSET ${offset}`;
      }

      const result = await databaseService.query(query, params);

      // Get total count for pagination
      let countQuery = `SELECT COUNT(*) FROM users WHERE 1=1`;
      const countParams: any[] = [];
      let countParamCount = 0;

      // Apply same filters for count
      if (role) {
        countParamCount++;
        countQuery += ` AND role = $${countParamCount}`;
        countParams.push(role);
      }

      if (isActive !== undefined) {
        countParamCount++;
        countQuery += ` AND is_active = $${countParamCount}`;
        countParams.push(isActive);
      }

      if (search) {
        countParamCount++;
        countQuery += ` AND (email ILIKE $${countParamCount} OR first_name ILIKE $${countParamCount} OR last_name ILIKE $${countParamCount} OR department ILIKE $${countParamCount})`;
        countParams.push(`%${search}%`);
      }

      const countResult = await databaseService.query(countQuery, countParams);
      const totalCount = parseInt(countResult.rows[0].count);

      res.json({
        message: 'Users retrieved successfully',
        users: result.rows,
        pagination: {
          page: pageQuery,
          limit: limitQuery,
          total: totalCount,
          pages: Math.ceil(totalCount / (limitQuery || 20))
        },
        filters: {
          role,
          isActive,
          search
        }
      });

    } catch (error) {
      logger.error('Get users error', { error, userId: (req as any).user?.userId });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An error occurred while retrieving users'
      });
    }
  });

/**
 * @route GET /api/v1/users/:userId
 * @desc Get a specific user
 * @access Private - Admin/Security roles only
 */
router.get('/:userId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const query = `
      SELECT 
        id,
        email,
        role,
        first_name,
        last_name,
        department,
        is_active,
        created_at,
        updated_at,
        last_login_at,
        password_changed_at,
        failed_login_attempts,
        locked_until
      FROM users
      WHERE id = $1
    `;

    const result = await databaseService.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
    }

    res.json({
      message: 'User retrieved successfully',
      user: result.rows[0]
    });

  } catch (error) {
    logger.error('Get user error', { error, userId: req.params.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving the user'
    });
  }
});

/**
 * @route POST /api/v1/users
 * @desc Create a new user
 * @access Private - Admin only
 */
router.post('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { error, value } = validateWithZod(createUserSchema, req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
    }

    const adminUserId = (req as any).user.userId;

    // Check if user already exists
    const existingUser = await databaseService.query(
      'SELECT id FROM users WHERE email = $1',
      [value.email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'User Already Exists',
        message: 'A user with this email already exists'
      });
    }

    // Hash password
    const passwordHash = await hashPassword(value.password);

    // Create user
    const query = `
      INSERT INTO users (
        email, password_hash, role, first_name, last_name, department, 
        is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id, email, role, first_name, last_name, department, is_active, created_at
    `;

    const result = await databaseService.query(query, [
      value.email,
      passwordHash,
      value.role,
      value.firstName || null,
      value.lastName || null,
      value.department || null,
      value.isActive
    ]);

    const newUser = result.rows[0];

    // Send welcome email if requested
    if (value.sendWelcomeEmail) {
      try {
        await notificationService.sendNotification({
          type: 'user_welcome',
          recipient: value.email,
          subject: 'Welcome to UAIP',
          message: `Welcome ${value.firstName || 'User'}! Your account has been created successfully.`,
          data: {
            name: value.firstName || 'User',
            email: value.email,
            role: value.role,
            loginUrl: `${config.frontend.baseUrl}/login`
          }
        });
      } catch (emailError) {
        logger.warn('Failed to send welcome email', { error: emailError, userId: newUser.id });
      }
    }

    await auditService.logSecurityEvent({
      eventType: AuditEventType.USER_CREATED,
      userId: adminUserId,
      details: {
        createdUserId: newUser.id,
        createdUserEmail: newUser.email,
        createdUserRole: newUser.role,
        isActive: newUser.is_active
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Remove sensitive data from response
    const { password, ...userResponse } = value;
    
    res.status(201).json({
      message: 'User created successfully',
      user: newUser
    });

  } catch (error) {
    logger.error('Create user error', { error, adminUserId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while creating the user'
    });
  }
});

/**
 * @route PUT /api/v1/users/:userId
 * @desc Update a user
 * @access Private - Admin only
 */
router.put('/:userId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { error, value } = validateWithZod(updateUserSchema, req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
    }

    const adminUserId = (req as any).user.userId;

    // Check if user exists
    const existingUser = await databaseService.query(
      'SELECT id, email, role, is_active FROM users WHERE id = $1',
      [userId]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
    }

    const currentUser = existingUser.rows[0];

    // Check if email is being changed and if it conflicts
    if (value.email && value.email !== currentUser.email) {
      const emailCheck = await databaseService.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [value.email, userId]
      );

      if (emailCheck.rows.length > 0) {
        return res.status(409).json({
          error: 'Email Already Exists',
          message: 'Another user with this email already exists'
        });
      }
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramCount = 0;

    if (value.email !== undefined) {
      paramCount++;
      updateFields.push(`email = $${paramCount}`);
      updateValues.push(value.email);
    }

    if (value.role !== undefined) {
      paramCount++;
      updateFields.push(`role = $${paramCount}`);
      updateValues.push(value.role);
    }

    if (value.firstName !== undefined) {
      paramCount++;
      updateFields.push(`first_name = $${paramCount}`);
      updateValues.push(value.firstName);
    }

    if (value.lastName !== undefined) {
      paramCount++;
      updateFields.push(`last_name = $${paramCount}`);
      updateValues.push(value.lastName);
    }

    if (value.department !== undefined) {
      paramCount++;
      updateFields.push(`department = $${paramCount}`);
      updateValues.push(value.department);
    }

    if (value.isActive !== undefined) {
      paramCount++;
      updateFields.push(`is_active = $${paramCount}`);
      updateValues.push(value.isActive);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'No Updates',
        message: 'No valid fields provided for update'
      });
    }

    paramCount++;
    updateFields.push(`updated_at = NOW()`);
    updateValues.push(userId);

    const query = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, email, role, first_name, last_name, department, is_active, created_at, updated_at
    `;

    const result = await databaseService.query(query, updateValues);
    const updatedUser = result.rows[0];

    await auditService.logSecurityEvent({
      eventType: AuditEventType.USER_UPDATED,
      userId: adminUserId,
      details: {
        updatedUserId: updatedUser.id,
        updatedUserEmail: updatedUser.email,
        updatedFields: Object.keys(value),
        previousRole: currentUser.role,
        newRole: updatedUser.role,
        previousActive: currentUser.is_active,
        newActive: updatedUser.is_active
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });

  } catch (error) {
    logger.error('Update user error', { error, userId: req.params.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while updating the user'
    });
  }
});

/**
 * @route DELETE /api/v1/users/:userId
 * @desc Delete a user (soft delete)
 * @access Private - Admin only
 */
router.delete('/:userId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const adminUserId = (req as any).user.userId;

    // Prevent self-deletion
    if (userId === adminUserId) {
      return res.status(400).json({
        error: 'Cannot Delete Self',
        message: 'You cannot delete your own account'
      });
    }

    // Check if user exists
    const existingUser = await databaseService.query(
      'SELECT id, email, role FROM users WHERE id = $1',
      [userId]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
    }

    const user = existingUser.rows[0];

    // Soft delete by setting is_active to false
    await databaseService.query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
      [userId]
    );

    // Revoke all refresh tokens
    await databaseService.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );

    await auditService.logSecurityEvent({
      eventType: AuditEventType.USER_DELETED,
      userId: adminUserId,
      details: {
        deletedUserId: user.id,
        deletedUserEmail: user.email,
        deletedUserRole: user.role
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      message: 'User deleted successfully'
    });

  } catch (error) {
    logger.error('Delete user error', { error, userId: req.params.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while deleting the user'
    });
  }
});

/**
 * @route POST /api/v1/users/:userId/reset-password
 * @desc Reset user password
 * @access Private - Admin only
 */
router.post('/:userId/reset-password', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { error, value } = validateWithZod(resetPasswordSchema, req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
    }

    const adminUserId = (req as any).user.userId;

    // Check if user exists
    const existingUser = await databaseService.query(
      'SELECT id, email FROM users WHERE id = $1',
      [userId]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
    }

    const user = existingUser.rows[0];

    // Generate new password if not provided
    const newPassword = value.newPassword || generateRandomPassword();
    const passwordHash = await hashPassword(newPassword);

    // Update password
    await databaseService.query(`
      UPDATE users 
      SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW()
      WHERE id = $2
    `, [passwordHash, userId]);

    // Revoke all refresh tokens to force re-login
    await databaseService.query(`
      UPDATE refresh_tokens 
      SET revoked_at = NOW() 
      WHERE user_id = $1 AND revoked_at IS NULL
    `, [userId]);

    // Send notification if requested
    if (value.sendNotification) {
      try {
        await notificationService.sendNotification({
          type: 'password_reset',
          recipient: user.email,
          subject: 'Password Reset - UAIP',
          message: `Your password has been reset by an administrator.`,
          data: {
            name: user.first_name || 'User',
            email: user.email,
            newPassword: newPassword,
            loginUrl: `${config.frontend.baseUrl}/login`
          }
        });
      } catch (emailError) {
        logger.warn('Failed to send password reset email', { error: emailError, userId });
      }
    }

    await auditService.logSecurityEvent({
      eventType: AuditEventType.PASSWORD_RESET_BY_ADMIN,
      userId: adminUserId,
      details: {
        targetUserId: userId,
        targetUserEmail: user.email,
        notificationSent: value.sendNotification
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      message: 'Password reset successfully',
      ...(value.newPassword ? {} : { temporaryPassword: newPassword })
    });

  } catch (error) {
    logger.error('Reset password error', { error, userId: req.params.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while resetting the password'
    });
  }
});

/**
 * @route POST /api/v1/users/:userId/unlock
 * @desc Unlock a locked user account
 * @access Private - Admin only
 */
router.post('/:userId/unlock', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const adminUserId = (req as any).user.userId;

    // Check if user exists
    const existingUser = await databaseService.query(
      'SELECT id, email, failed_login_attempts, locked_until FROM users WHERE id = $1',
      [userId]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
    }

    const user = existingUser.rows[0];

    // Unlock the account
    await databaseService.query(`
      UPDATE users 
      SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
      WHERE id = $1
    `, [userId]);

    await auditService.logSecurityEvent({
      eventType: AuditEventType.USER_UNLOCKED,
      userId: adminUserId,
      details: {
        unlockedUserId: userId,
        unlockedUserEmail: user.email,
        previousFailedAttempts: user.failed_login_attempts,
        wasLockedUntil: user.locked_until
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      message: 'User account unlocked successfully'
    });

  } catch (error) {
    logger.error('Unlock user error', { error, userId: req.params.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while unlocking the user account'
    });
  }
});

/**
 * @route POST /api/v1/users/bulk-action
 * @desc Perform bulk actions on multiple users
 * @access Private - Admin only
 */
router.post('/bulk-action', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { error, value } = validateWithZod(bulkActionSchema, req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
    }

    const adminUserId = (req as any).user.userId;
    const { userIds, action, reason } = value;

    // Prevent admin from performing bulk actions on themselves
    if (userIds.includes(adminUserId)) {
      return res.status(400).json({
        error: 'Cannot Perform Action on Self',
        message: 'You cannot perform bulk actions on your own account'
      });
    }

    const results: {
      successful: Array<{ userId: string; email: string }>;
      failed: Array<{ userId: string; reason: string }>;
    } = {
      successful: [],
      failed: []
    };

    for (const userId of userIds) {
      try {
        // Check if user exists
        const userResult = await databaseService.query(
          'SELECT id, email, role FROM users WHERE id = $1',
          [userId]
        );

        if (userResult.rows.length === 0) {
          results.failed.push({ userId, reason: 'User not found' });
          continue;
        }

        const user = userResult.rows[0];

        switch (action) {
          case 'activate':
            await databaseService.query(
              'UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1',
              [userId]
            );
            break;

          case 'deactivate':
            await databaseService.query(
              'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
              [userId]
            );
            // Revoke refresh tokens
            await databaseService.query(
              'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
              [userId]
            );
            break;

          case 'delete':
            await databaseService.query(
              'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
              [userId]
            );
            // Revoke refresh tokens
            await databaseService.query(
              'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
              [userId]
            );
            break;

          case 'reset_password':
            const newPassword = generateRandomPassword();
            const passwordHash = await hashPassword(newPassword);
            await databaseService.query(
              'UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2',
              [passwordHash, userId]
            );
            // Revoke refresh tokens
            await databaseService.query(
              'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
              [userId]
            );
            break;

          default:
            results.failed.push({ userId, reason: 'Invalid action' });
            continue;
        }

        results.successful.push({ userId, email: user.email });

        // Log audit event
        await auditService.logSecurityEvent({
          eventType: AuditEventType.BULK_USER_ACTION,
          userId: adminUserId,
          details: {
            action,
            targetUserId: userId,
            targetUserEmail: user.email,
            reason: reason || null
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });

      } catch (userError) {
        logger.error('Bulk action error for user', { error: userError, userId, action });
        results.failed.push({ userId, reason: 'Processing error' });
      }
    }

    res.json({
      message: `Bulk action '${action}' completed`,
      results
    });

  } catch (error) {
    logger.error('Bulk action error', { error, adminUserId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while performing bulk action'
    });
  }
});

/**
 * @route GET /api/v1/users/stats
 * @desc Get user statistics
 * @access Private - Admin/Security roles only
 */
router.get('/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    // Get user counts by role
    const roleStatsQuery = `
      SELECT 
        role,
        COUNT(*) as count,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_count,
        COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_count
      FROM users
      GROUP BY role
      ORDER BY count DESC
    `;

    const roleStats = await databaseService.query(roleStatsQuery);

    // Get recent user activity
    const recentActivityQuery = `
      SELECT 
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as new_users_24h,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_users_7d,
        COUNT(CASE WHEN last_login_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as active_users_24h,
        COUNT(CASE WHEN last_login_at >= NOW() - INTERVAL '7 days' THEN 1 END) as active_users_7d,
        COUNT(CASE WHEN locked_until > NOW() THEN 1 END) as locked_users
      FROM users
    `;

    const activityStats = await databaseService.query(recentActivityQuery);

    // Get department distribution
    const departmentStatsQuery = `
      SELECT 
        COALESCE(department, 'No Department') as department,
        COUNT(*) as count
      FROM users
      GROUP BY department
      ORDER BY count DESC
      LIMIT 10
    `;

    const departmentStats = await databaseService.query(departmentStatsQuery);

    res.json({
      message: 'User statistics retrieved successfully',
      statistics: {
        roleDistribution: roleStats.rows,
        recentActivity: activityStats.rows[0],
        departmentDistribution: departmentStats.rows,
        summary: {
          totalUsers: roleStats.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
          activeUsers: roleStats.rows.reduce((sum, row) => sum + parseInt(row.active_count), 0),
          inactiveUsers: roleStats.rows.reduce((sum, row) => sum + parseInt(row.inactive_count), 0)
        }
      }
    });

  } catch (error) {
    logger.error('Get user stats error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving user statistics'
    });
  }
});

export default router; 