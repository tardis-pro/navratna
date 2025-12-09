import { z } from 'zod';
import { logger } from '@uaip/utils';
import { UserService } from '@uaip/shared-services';
import { validateJWTToken } from '@uaip/middleware';
import { withOptionalAuth, withAdminGuard, withRequiredAuth } from './middleware/auth.plugin.js';
import { AuditService } from '../services/auditService.js';
import { AuditEventType, LLMTaskType, LLMProviderType } from '@uaip/types';

let userService: UserService | null = null;
let auditService: AuditService | null = null;

async function getServices() {
  if (!userService) userService = UserService.getInstance();
  if (!auditService) auditService = new AuditService();
  return { userService, auditService };
}

// Auth helpers now handled by Elysia plugin; ctx.user is injected by attachAuth

const userQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(['user', 'admin', 'security_admin', 'auditor']).optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
});

const publicUserQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().max(100).optional(),
});

const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain lowercase, uppercase, number, special char'
    ),
  role: z.enum(['user', 'admin', 'security_admin', 'auditor']).default('user'),
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  department: z.string().max(100).optional(),
  isActive: z.boolean().default(true),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(['user', 'admin', 'security_admin', 'auditor']).optional(),
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  department: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
});

const userLLMPreferenceSchema = z.object({
  taskType: z.nativeEnum(LLMTaskType),
  preferredProvider: z.nativeEnum(LLMProviderType),
  preferredModel: z.string().min(1).max(255),
  fallbackModel: z.string().max(255).optional(),
  settings: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().positive().optional(),
      topP: z.number().min(0).max(1).optional(),
      systemPrompt: z.string().max(1000).optional(),
      customSettings: z.record(z.any()).optional(),
    })
    .optional(),
  description: z.string().max(500).optional(),
  priority: z.number().int().min(1).max(100).default(50),
  isActive: z.boolean().default(true),
});

const updateUserLLMPreferencesSchema = z.object({
  preferences: z.array(userLLMPreferenceSchema),
});

export function registerUserRoutes(app: any): any {
  return app.group('/api/v1/users', (app: any) =>
    withOptionalAuth(app)
      // GET /api/v1/users (admin)
      .group('', (g: any) =>
        withAdminGuard(g).get('/', async ({ set, query }) => {
          const parsed = userQuerySchema.safeParse(query);
          if (!parsed.success) {
            set.status = 400;
            return { error: 'Validation Error', details: parsed.error.flatten() };
          }
          const { page, limit, role, isActive, search } = parsed.data;
          const offset = (page - 1) * limit;
          try {
            const { userService } = await getServices();
            const repo = userService.getUserRepository();
            const result = await repo.searchUsers({
              search: search as any,
              role: role as any,
              isActive: isActive as any,
              limit,
              offset,
            });
            return {
              message: 'Users retrieved successfully',
              users: result.users,
              pagination: {
                page,
                limit,
                total: result.total,
                pages: Math.ceil(result.total / limit),
              },
              filters: { role, isActive, search },
            };
          } catch (error) {
            logger.error('Get users error', { error });
            set.status = 500;
            return { error: 'Internal Server Error', message: 'Failed to retrieve users' };
          }
        })
      )

      // GET /api/v1/users/public
      .get('/public', async ({ set, query }) => {
        const parsed = publicUserQuerySchema.safeParse(query);
        if (!parsed.success) {
          set.status = 400;
          return { error: 'Validation Error', details: parsed.error.flatten() };
        }
        const { page, limit, search } = parsed.data;
        const offset = (page - 1) * limit;
        try {
          const { userService } = await getServices();
          const repo = userService.getUserRepository();
          const result = await repo.searchUsers({
            search: search as any,
            role: 'user' as any,
            isActive: true as any,
            limit,
            offset,
          });
          const publicUsers = result.users.map((u: any) => ({
            id: u.id,
            email: u.email,
            displayName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email.split('@')[0],
            firstName: u.firstName,
            lastName: u.lastName,
            department: u.department,
            createdAt: u.createdAt,
            lastLoginAt: u.lastLoginAt,
          }));
          return {
            success: true,
            message: 'Public users retrieved successfully',
            data: {
              users: publicUsers,
              pagination: {
                page,
                limit,
                total: result.total,
                pages: Math.ceil(result.total / limit),
              },
            },
          };
        } catch (error) {
          set.status = 500;
          return {
            success: false,
            error: 'Internal Server Error',
            message: 'Failed to retrieve public users',
          };
        }
      })

      // GET /api/v1/users/llm-preferences
      .group('', (g: any) =>
        withRequiredAuth(g)
          .get('/llm-preferences', async ({ set, user }) => {
            try {
              const { userService } = await getServices();
              const repo = userService.getUserLLMPreferenceRepository();
              const prefs = await repo.findByUser(user!.id);
              return prefs;
            } catch (error) {
              set.status = 500;
              return { error: 'Internal Server Error', message: 'Failed to retrieve preferences' };
            }
          })

          // PUT /api/v1/users/llm-preferences
          .put('/llm-preferences', async ({ set, user, body }) => {
            const parsed = updateUserLLMPreferencesSchema.safeParse(body);
            if (!parsed.success) {
              set.status = 400;
              return { error: 'Validation Error', details: parsed.error.flatten() };
            }
            try {
              const { userService } = await getServices();
              const repo = userService.getUserLLMPreferenceRepository();
              await repo.bulkUpsert(
                parsed.data.preferences.map((p) => ({ ...p, userId: user!.id })) as any
              );
              return { message: 'Preferences updated' };
            } catch (error) {
              set.status = 500;
              return { error: 'Internal Server Error', message: 'Failed to update preferences' };
            }
          })
      )

      // GET /api/v1/users/:userId (admin)
      .group('', (g: any) =>
        withAdminGuard(g)
          .get('/:userId', async ({ set, params }) => {
            try {
              const { userService } = await getServices();
              const user = await userService.findUserById(params.userId);
              if (!user) {
                set.status = 404;
                return { error: 'User Not Found', message: 'User not found' };
              }
              const { passwordHash, ...userResponse } = user as any;
              return { message: 'User retrieved successfully', user: userResponse };
            } catch (error) {
              set.status = 500;
              return { error: 'Internal Server Error', message: 'Failed to retrieve user' };
            }
          })

          // POST /api/v1/users (admin)
          .post('/', async ({ set, body, user }) => {
            const parsed = createUserSchema.safeParse(body);
            if (!parsed.success) {
              set.status = 400;
              return { error: 'Validation Error', details: parsed.error.flatten() };
            }
            try {
              const { userService, auditService } = await getServices();
              const existing = await userService.findUserByEmail(parsed.data.email);
              if (existing) {
                set.status = 409;
                return {
                  error: 'User Already Exists',
                  message: 'A user with this email already exists',
                };
              }
              const created = await userService.createUser({
                email: parsed.data.email,
                password: parsed.data.password,
                role: parsed.data.role,
                firstName: parsed.data.firstName,
                lastName: parsed.data.lastName,
                department: parsed.data.department,
              });
              if (parsed.data.isActive === false) {
                await userService.getUserRepository().deactivateUser(created.id);
              } else if (parsed.data.isActive === true) {
                await userService.getUserRepository().activateUser(created.id);
              }
              await auditService.logSecurityEvent({
                eventType: AuditEventType.USER_CREATED,
                userId: user!.id,
                details: {
                  createdUserId: created.id,
                  createdUserEmail: created.email,
                  createdUserRole: created.role,
                  isActive: created.isActive,
                },
                ipAddress: '',
                userAgent: '',
              });
              const { passwordHash, ...userResponse } = created as any;
              set.status = 201;
              return { message: 'User created successfully', user: userResponse };
            } catch (error) {
              logger.error('Create user error', { error });
              set.status = 500;
              return { error: 'Internal Server Error', message: 'Failed to create user' };
            }
          })

          // PUT /api/v1/users/:userId (admin)
          .put('/:userId', async ({ set, body, params }) => {
            const parsed = updateUserSchema.safeParse(body);
            if (!parsed.success) {
              set.status = 400;
              return { error: 'Validation Error', details: parsed.error.flatten() };
            }
            try {
              const { userService, auditService } = await getServices();
              const current = await userService.findUserById(params.userId);
              if (!current) {
                set.status = 404;
                return { error: 'User Not Found', message: 'User not found' };
              }
              if (parsed.data.email && parsed.data.email !== current.email) {
                const emailCheck = await userService.findUserByEmail(parsed.data.email);
                if (emailCheck && emailCheck.id !== params.userId) {
                  set.status = 409;
                  return {
                    error: 'Email Already Exists',
                    message: 'Another user with this email already exists',
                  };
                }
              }
              const repo = userService.getUserRepository();
              const updated = await repo.updateUserProfile(params.userId, {
                firstName: parsed.data.firstName,
                lastName: parsed.data.lastName,
                department: parsed.data.department,
                role: parsed.data.role,
                isActive: parsed.data.isActive,
              });
              if (!updated) {
                set.status = 500;
                return { error: 'Update Failed', message: 'Failed to update user' };
              }
              if (parsed.data.email && parsed.data.email !== current.email) {
                await userService.updateUser(params.userId, { email: parsed.data.email });
              }
              await auditService.logSecurityEvent({
                eventType: AuditEventType.USER_UPDATED,
                userId: undefined,
                details: {
                  updatedUserId: updated.id,
                  updatedUserEmail: updated.email,
                  updatedFields: Object.keys(parsed.data),
                  previousRole: (current as any).role,
                  newRole: (updated as any).role,
                  previousActive: (current as any).isActive,
                  newActive: (updated as any).isActive,
                },
                ipAddress: '',
                userAgent: '',
              });
              return { message: 'User updated successfully', user: updated };
            } catch (error) {
              set.status = 500;
              return { error: 'Internal Server Error', message: 'Failed to update user' };
            }
          })

          // DELETE /api/v1/users/:userId (admin)
          .delete('/:userId', async ({ set, params }) => {
            try {
              const { userService, auditService } = await getServices();
              const ok = await userService.deleteUser(params.userId);
              if (!ok) {
                set.status = 404;
                return { error: 'User Not Found', message: 'User not found' };
              }
              await auditService.logSecurityEvent({
                eventType: AuditEventType.USER_DELETED,
                userId: undefined,
                details: { deletedUserId: params.userId },
                ipAddress: '',
                userAgent: '',
              });
              return { message: 'User deleted successfully' };
            } catch (error) {
              set.status = 500;
              return { error: 'Internal Server Error', message: 'Failed to delete user' };
            }
          })

          // GET /api/v1/users/stats (admin)
          .get('/stats', async ({ set }) => {
            try {
              const { userService } = await getServices();
              const statistics = await userService.getUserRepository().getUserStats();
              return {
                message: 'User statistics retrieved successfully',
                statistics: {
                  roleDistribution: statistics.roleStats,
                  departmentDistribution: statistics.departmentStats,
                  summary: {
                    totalUsers: statistics.totalUsers,
                    activeUsers: statistics.activeUsers,
                    inactiveUsers: statistics.inactiveUsers,
                  },
                },
              };
            } catch (error) {
              set.status = 500;
              return { error: 'Internal Server Error', message: 'Failed to load stats' };
            }
          })
      )
  );
}

export default registerUserRoutes;
