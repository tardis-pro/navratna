import { Elysia, t } from 'elysia';
// Elysia's type system cannot infer the 'user' property through nested .group() calls combined with middleware wrappers.
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { UserService } from '@uaip/shared-services';
import { validateJWTToken as _validateJWTToken } from '@uaip/middleware';
import { withOptionalAuth, withAdminGuard, withRequiredAuth } from '@uaip/middleware';
import { AuditService } from '../services/audit_service.js';
import { AuditEventType, LLMTaskType, LLMProviderType } from '@uaip/types';

let userServiceSingleton: UserService | null = null;
let auditServiceSingleton: AuditService | null = null;

async function getServices() {
  if (!userServiceSingleton) userServiceSingleton = UserService.getInstance();
  if (!auditServiceSingleton) auditServiceSingleton = new AuditService();
  return { userService: userServiceSingleton, auditService: auditServiceSingleton };
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

const searchRoleSchema = z.enum(['user', 'admin', 'security_admin', 'auditor']).optional();

const omitPasswordHash = <T extends { passwordHash?: string }>(user: T) => {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
};

const UserSchema = t.Object({
  id: t.String(),
  email: t.String(),
  firstName: t.Optional(t.Any()),
  lastName: t.Optional(t.Any()),
  department: t.Optional(t.Any()),
  role: t.String(),
  isActive: t.Boolean(),
  createdAt: t.Union([t.String(), t.Date()]),
  updatedAt: t.Optional(t.Union([t.String(), t.Date()])),
  lastLoginAt: t.Optional(t.Any()),
  failedLoginAttempts: t.Optional(t.Number()),
})

const PublicUserSchema = t.Object({
  id: t.String(),
  email: t.String(),
  displayName: t.String(),
  firstName: t.Union([t.String(), t.Null()]),
  lastName: t.Union([t.String(), t.Null()]),
  department: t.Union([t.String(), t.Null()]),
  createdAt: t.Union([t.String(), t.Date()]),
  lastLoginAt: t.Optional(t.Union([t.String(), t.Date(), t.Null()])),
})

const PaginationSchema = t.Object({
  page: t.Number(),
  limit: t.Number(),
  total: t.Number(),
  pages: t.Number(),
})

const HttpErrorSchema = t.Object({ error: t.String(), message: t.Optional(t.String()) })

export function registerUserRoutes() {
  return new Elysia().group('/api/v1/users', (app) => withOptionalAuth(app)
    // GET /api/v1/users (admin)
    .group('', (g) => withAdminGuard(g).get('/', async ({ set, query }) => {
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
          search,
          role: searchRoleSchema.parse(role),
          isActive,
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
    }, {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        role: t.Optional(t.String()),
        isActive: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          message: t.String(),
          users: t.Array(t.Any()),
          pagination: PaginationSchema,
          filters: t.Any(),
        }),
        400: t.Object({ error: t.String(), details: t.Any() }),
        500: HttpErrorSchema,
      },
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
          search,
          role: 'user',
          isActive: true,
          limit,
          offset,
        });
        const publicUsers = result.users.map((u) => ({
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
      } catch {
        set.status = 500;
      return {
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to retrieve public users',
      };
      }
    }, {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          message: t.String(),
          data: t.Object({
            users: t.Array(PublicUserSchema),
            pagination: PaginationSchema,
          }),
        }),
        400: t.Object({ error: t.String(), details: t.Any() }),
        500: t.Object({ success: t.Literal(false), error: t.String(), message: t.String() }),
      },
    })
  
    // GET /api/v1/users/llm-preferences
    .group('', (g) => withRequiredAuth(g)
      .get('/llm-preferences', async ({ set, user }) => {
        try {
          const { userService } = await getServices();
          const repo = userService.getUserLLMPreferenceRepository();
          // @ts-expect-error -- Property not found
          const prefs = await repo.findByUser(user.id);
          return prefs;
        } catch {
          set.status = 500;
          return { error: 'Internal Server Error', message: 'Failed to retrieve preferences' };
        }
      }, {
        response: {
          200: t.Array(t.Any()),
          500: HttpErrorSchema,
        },
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
          // @ts-expect-error -- Property not found
          await repo.bulkUpsert(
            parsed.data.preferences.map(
              ({
                taskType,
                preferredProvider,
                preferredModel,
                fallbackModel,
                settings,
                description,
                priority,
              }) => ({
                userId: user.id,
                taskType,
                preferredProvider,
                preferredModel,
                fallbackModel,
                settings,
                description,
                priority,
              })
            )
          );
          return { message: 'Preferences updated' };
        } catch {
          set.status = 500;
          return { error: 'Internal Server Error', message: 'Failed to update preferences' };
        }
      }, {
        body: t.Object({
          preferences: t.Array(t.Object({
            taskType: t.String(),
            preferredProvider: t.String(),
            preferredModel: t.String(),
            fallbackModel: t.Optional(t.String()),
            settings: t.Optional(t.Any()),
            description: t.Optional(t.String()),
            priority: t.Optional(t.Number()),
            isActive: t.Optional(t.Boolean()),
          })),
        }),
        response: {
          200: t.Object({ message: t.String() }),
          400: t.Object({ error: t.String(), details: t.Any() }),
          500: HttpErrorSchema,
        },
      })
    )
  
    // GET /api/v1/users/:userId (admin)
    .group('', (g) => withAdminGuard(g)
      .get('/:userId', async ({ set, params }) => {
        try {
          const { userService } = await getServices();
          const user = await userService.findUserById(params.userId);
          if (!user) {
            set.status = 404;
            return { error: 'User Not Found', message: 'User not found' };
          }
          const userResponse = omitPasswordHash(user);
          return { message: 'User retrieved successfully', user: userResponse };
        } catch {
          set.status = 500;
          return { error: 'Internal Server Error', message: 'Failed to retrieve user' };
        }
      }, {
        response: {
          200: t.Object({ message: t.String(), user: UserSchema }),
          404: t.Object({ error: t.String(), message: t.String() }),
          500: HttpErrorSchema,
        },
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
            userId: user.id,
            details: {
              createdUserId: created.id,
              createdUserEmail: created.email,
              createdUserRole: created.role,
              isActive: created.isActive,
            },
            ipAddress: '',
            userAgent: '',
          });
          const userResponse = omitPasswordHash(created);
          set.status = 201;
          return { message: 'User created successfully', user: userResponse };
        } catch (error) {
          logger.error('Create user error', { error });
          set.status = 500;
          return { error: 'Internal Server Error', message: 'Failed to create user' };
        }
      }, {
        body: t.Object({
          email: t.String(),
          password: t.String(),
          role: t.Optional(t.String()),
          firstName: t.Optional(t.String()),
          lastName: t.Optional(t.String()),
          department: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
        }),
        response: {
          201: t.Object({ message: t.String(), user: UserSchema }),
          400: t.Object({ error: t.String(), details: t.Any() }),
          409: t.Object({ error: t.String(), message: t.String() }),
          500: HttpErrorSchema,
        },
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
              previousRole: current.role,
              newRole: updated.role,
              previousActive: current.isActive,
              newActive: updated.isActive,
            },
            ipAddress: '',
            userAgent: '',
          });
          return { message: 'User updated successfully', user: updated };
        } catch {
          set.status = 500;
          return { error: 'Internal Server Error', message: 'Failed to update user' };
        }
      }, {
        body: t.Object({
          email: t.Optional(t.String()),
          role: t.Optional(t.String()),
          firstName: t.Optional(t.String()),
          lastName: t.Optional(t.String()),
          department: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
        }),
        response: {
          200: t.Object({ message: t.String(), user: t.Any() }),
          400: t.Object({ error: t.String(), details: t.Any() }),
          404: t.Object({ error: t.String(), message: t.String() }),
          409: t.Object({ error: t.String(), message: t.String() }),
          500: HttpErrorSchema,
        },
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
        } catch {
          set.status = 500;
          return { error: 'Internal Server Error', message: 'Failed to delete user' };
        }
      }, {
        response: {
          200: t.Object({ message: t.String() }),
          404: t.Object({ error: t.String(), message: t.String() }),
          500: HttpErrorSchema,
        },
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
        } catch {
          set.status = 500;
          return { error: 'Internal Server Error', message: 'Failed to load stats' };
        }
      }, {
        response: {
          200: t.Object({
            message: t.String(),
            statistics: t.Object({
              roleDistribution: t.Any(),
              departmentDistribution: t.Any(),
              summary: t.Object({
                totalUsers: t.Number(),
                activeUsers: t.Number(),
                inactiveUsers: t.Number(),
              }),
            }),
          }),
          500: HttpErrorSchema,
        },
      })
    )
  );

}

export default registerUserRoutes;
