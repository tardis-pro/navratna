import express, { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { logger } from '@uaip/utils';
import { authMiddleware, requireAdmin } from '@uaip/middleware';
import { validateRequest } from '@uaip/middleware';
import { AuditService } from '../services/auditService.js';
import { NotificationService } from '../services/notificationService.js';
import { DatabaseService } from '@uaip/shared-services';
import { Request, Response } from 'express';
import { config } from '@uaip/config';
import { AuditEventType } from '@uaip/types';

const router: Router = express.Router();

// Lazy initialization of services
let databaseService: DatabaseService | null = null;
let auditService: AuditService | null = null;

async function getServices() {
  if (!databaseService) {
    databaseService = new DatabaseService();
    await databaseService.initialize();
    auditService = new AuditService(databaseService);
  }
  return { databaseService, auditService: auditService! };
}

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
  userIds: z.array(z.string()).min(1).max(100),
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

      // Parse and validate query parameters
      const pageQuery = parseInt(page as string) || 1;
      const limitQuery = parseInt(limit as string) || 20;
      const offset = (pageQuery - 1) * limitQuery;

      // Use DatabaseService searchUsers method for TypeORM-based search
      const result = await databaseService.searchUsers({
        search: search as string,
        role: role as string,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        limit: limitQuery,
        offset: offset
      });

      res.json({
        message: 'Users retrieved successfully',
        users: result.users,
        pagination: {
          page: pageQuery,
          limit: limitQuery,
          total: result.total,
          pages: Math.ceil(result.total / limitQuery)
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
      return;
        return;
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

    // Use DatabaseService getUserById method
    const user = await databaseService.getUserById(userId);

    if (!user) {
      res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
      return;
        return;
    }

    // Remove sensitive data from response
    const { passwordHash, ...userResponse } = user;

    res.json({
      message: 'User retrieved successfully',
      user: userResponse
    });

  } catch (error) {
    logger.error('Get user error', { error, userId: req.params.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving the user'
    });
      return;
        return;
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
      res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
      return;
        return;
    }

    const adminUserId = (req as any).user.userId;

    // Check if user already exists using DatabaseService
    const existingUser = await databaseService.getUserByEmail(value.email);

    if (existingUser) {
      res.status(409).json({
        error: 'User Already Exists',
        message: 'A user with this email already exists'
      });
      return;
        return;
    }

    // Hash password
    const passwordHash = await hashPassword(value.password);

    // Create user using DatabaseService
    const newUser = await databaseService.createUser({
      email: value.email,
      passwordHash,
      role: value.role,
      firstName: value.firstName,
      lastName: value.lastName,
      department: value.department,
      isActive: value.isActive
    });

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
        isActive: newUser.isActive
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Remove sensitive data from response
    const { passwordHash: _, ...userResponse } = newUser;
    
    res.status(201).json({
      message: 'User created successfully',
      user: userResponse
    });
      return;
        return;

  } catch (error) {
    logger.error('Create user error', { error, adminUserId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while creating the user'
    });
      return;
        return;
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
      res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
      return;
        return;
    }

    const adminUserId = (req as any).user.userId;

    // Check if user exists using DatabaseService
    const currentUser = await databaseService.getUserById(userId);

    if (!currentUser) {
      res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
      return;
        return;
    }

    // Check if email is being changed and if it conflicts
    if (value.email && value.email !== currentUser.email) {
      const emailCheck = await databaseService.getUserByEmail(value.email);

      if (emailCheck && emailCheck.id !== userId) {
        res.status(409).json({
          error: 'Email Already Exists',
          message: 'Another user with this email already exists'
        });
      return;
        return;
      }
    }

    // Check if there are any fields to update
    const hasUpdates = Object.keys(value).length > 0;
    if (!hasUpdates) {
      res.status(400).json({
        error: 'No Updates',
        message: 'No valid fields provided for update'
      });
      return;
        return;
    }

    // Update user using DatabaseService
    const updatedUser = await databaseService.updateUserProfile(userId, {
      firstName: value.firstName,
      lastName: value.lastName,
      department: value.department,
      role: value.role,
      isActive: value.isActive
    });

    // Handle email update separately if needed (not in updateUserProfile)
    if (value.email && value.email !== currentUser.email) {
      // Use the generic update method for email
      await databaseService.updateUser(userId, { email: value.email });
      // Refresh the user data
      const refreshedUser = await databaseService.getUserById(userId);
      if (refreshedUser) {
        Object.assign(updatedUser, refreshedUser);
      }
    }

    if (!updatedUser) {
      res.status(500).json({
        error: 'Update Failed',
        message: 'Failed to update user'
      });
      return;
        return;
    }

    await auditService.logSecurityEvent({
      eventType: AuditEventType.USER_UPDATED,
      userId: adminUserId,
      details: {
        updatedUserId: updatedUser.id,
        updatedUserEmail: updatedUser.email,
        updatedFields: Object.keys(value),
        previousRole: currentUser.role,
        newRole: updatedUser.role,
        previousActive: currentUser.isActive,
        newActive: updatedUser.isActive
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Remove sensitive data from response
    const { passwordHash, ...userResponse } = updatedUser;

    res.json({
      message: 'User updated successfully',
      user: userResponse
    });

  } catch (error) {
    logger.error('Update user error', { error, userId: req.params.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while updating the user'
    });
      return;
        return;
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
      res.status(400).json({
        error: 'Cannot Delete Self',
        message: 'You cannot delete your own account'
      });
      return;
        return;
    }

    // Check if user exists using DatabaseService
    const user = await databaseService.getUserById(userId);

    if (!user) {
      res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
      return;
        return;
    }

    // Soft delete using DatabaseService (deactivates user)
    const deleted = await databaseService.deleteUser(userId);

    if (!deleted) {
      res.status(500).json({
        error: 'Delete Failed',
        message: 'Failed to delete user'
      });
      return;
        return;
    }

    // Revoke all refresh tokens using DatabaseService
    await databaseService.revokeAllUserRefreshTokens(userId);

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
      return;
        return;
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
      res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
      return;
        return;
    }

    const adminUserId = (req as any).user.userId;

    // Check if user exists using DatabaseService
    const user = await databaseService.getUserById(userId);

    if (!user) {
      res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
      return;
        return;
    }

    // Generate new password if not provided
    const newPassword = value.newPassword || generateRandomPassword();
    const passwordHash = await hashPassword(newPassword);

    // Update password using DatabaseService
    await databaseService.updateUserPassword(userId, passwordHash);

    // Revoke all refresh tokens to force re-login using DatabaseService
    await databaseService.revokeAllUserRefreshTokens(userId);

    // Send notification if requested
    if (value.sendNotification) {
      try {
        await notificationService.sendNotification({
          type: 'password_reset',
          recipient: user.email,
          subject: 'Password Reset - UAIP',
          message: `Your password has been reset by an administrator.`,
          data: {
            name: user.firstName || 'User',
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
      return;
        return;
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

    // Check if user exists using DatabaseService
    const user = await databaseService.getUserById(userId);

    if (!user) {
      res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
      return;
        return;
    }

    // Unlock the account using DatabaseService
    await databaseService.resetUserLoginAttempts(userId);

    await auditService.logSecurityEvent({
      eventType: AuditEventType.USER_UNLOCKED,
      userId: adminUserId,
      details: {
        unlockedUserId: userId,
        unlockedUserEmail: user.email,
        previousFailedAttempts: user.failedLoginAttempts,
        wasLockedUntil: user.lockedUntil
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
      return;
        return;
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
      res.status(400).json({
        error: 'Validation Error',
        details: error.details.map(d => d.message)
      });
      return;
        return;
    }

    const adminUserId = (req as any).user.userId;
    const { userIds, action, reason } = value;

    // Prevent admin from performing bulk actions on themselves
    if (userIds.includes(adminUserId)) {
      res.status(400).json({
        error: 'Cannot Perform Action on Self',
        message: 'You cannot perform bulk actions on your own account'
      });
      return;
        return;
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
        // Check if user exists using DatabaseService
        const user = await databaseService.getUserById(userId);

        if (!user) {
          results.failed.push({ userId, reason: 'User not found' });
          continue;
        }

        switch (action) {
          case 'activate':
            await databaseService.activateUser(userId);
            break;

          case 'deactivate':
            await databaseService.deactivateUser(userId);
            // Revoke refresh tokens using DatabaseService
            await databaseService.revokeAllUserRefreshTokens(userId);
            break;

          case 'delete':
            await databaseService.deleteUser(userId);
            // Revoke refresh tokens using DatabaseService
            await databaseService.revokeAllUserRefreshTokens(userId);
            break;

          case 'reset_password':
            const newPassword = generateRandomPassword();
            const passwordHash = await hashPassword(newPassword);
            await databaseService.updateUserPassword(userId, passwordHash);
            // Revoke refresh tokens using DatabaseService
            await databaseService.revokeAllUserRefreshTokens(userId);
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
      return;
        return;
  }
});

/**
 * @route GET /api/v1/users/stats
 * @desc Get user statistics
 * @access Private - Admin/Security roles only
 */
router.get('/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    // Use DatabaseService getUserStats method for TypeORM-based statistics
    const statistics = await databaseService.getUserStats();

    res.json({
      message: 'User statistics retrieved successfully',
      statistics: {
        roleDistribution: statistics.roleStats,
        recentActivity: {
          new_users_24h: 0, // These would need additional methods in DatabaseService
          new_users_7d: 0,  // for time-based queries if needed
          active_users_24h: 0,
          active_users_7d: 0,
          locked_users: 0
        },
        departmentDistribution: statistics.departmentStats,
        summary: {
          totalUsers: statistics.totalUsers,
          activeUsers: statistics.activeUsers,
          inactiveUsers: statistics.inactiveUsers
        }
      }
    });

  } catch (error) {
    logger.error('Get user stats error', { error, userId: (req as any).user?.userId });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving user statistics'
    });
      return;
        return;
  }
});

export default router; 