import { z } from 'zod';
import { BaseEntitySchema, IDSchema } from './common.js';
import { SecurityLevel } from './security.js';

// User management types
export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  department: z.string().max(100).optional(),
  securityClearance: z.nativeEnum(SecurityLevel).default(SecurityLevel.MEDIUM),
  isActive: z.boolean().default(true),
  sendWelcomeEmail: z.boolean().default(true),
  temporaryPassword: z.boolean().default(false),
  metadata: z.record(z.any()).optional()
});

export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(255).optional(),
  role: z.string().min(1).max(100).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  department: z.string().max(100).optional(),
  securityClearance: z.nativeEnum(SecurityLevel).optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.any()).optional()
});

export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().default(false),
  mfaCode: z.string().optional(),
  deviceId: z.string().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional()
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  user: z.object({
    id: IDSchema,
    email: z.string().email(),
    name: z.string(),
    role: z.string(),
    department: z.string().optional(),
    securityClearance: z.nativeEnum(SecurityLevel),
    isActive: z.boolean(),
    lastLoginAt: z.date().optional()
  }),
  tokens: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number(),
    tokenType: z.string().default('Bearer')
  }),
  session: z.object({
    sessionId: z.string(),
    expiresAt: z.date(),
    permissions: z.array(z.string())
  }),
  requiresMfa: z.boolean().default(false),
  mfaSetupRequired: z.boolean().default(false)
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
  logoutOtherSessions: z.boolean().default(false)
});

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  email: z.string().email().optional(),
  token: z.string().optional(),
  newPassword: z.string().min(8).max(128).optional(),
  confirmPassword: z.string().min(8).max(128).optional()
});

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const UserStatsSchema = z.object({
  totalUsers: z.number().min(0),
  activeUsers: z.number().min(0),
  inactiveUsers: z.number().min(0),
  lockedUsers: z.number().min(0),
  usersByRole: z.record(z.number()),
  usersByDepartment: z.record(z.number()),
  usersBySecurityClearance: z.record(z.number()),
  recentLogins: z.number().min(0),
  failedLogins: z.number().min(0),
  passwordResets: z.number().min(0),
  averageSessionDuration: z.number().min(0),
  generatedAt: z.date()
});

export type UserStats = z.infer<typeof UserStatsSchema>;

export const BulkUserActionSchema = z.object({
  action: z.enum(['activate', 'deactivate', 'delete', 'unlock', 'reset_password', 'update_role']),
  userIds: z.array(IDSchema).min(1),
  parameters: z.record(z.any()).optional(),
  reason: z.string().optional(),
  notifyUsers: z.boolean().default(false),
  dryRun: z.boolean().default(false)
});

export type BulkUserAction = z.infer<typeof BulkUserActionSchema>;

export const UserSearchFiltersSchema = z.object({
  query: z.string().optional(),
  role: z.string().optional(),
  department: z.string().optional(),
  securityClearance: z.nativeEnum(SecurityLevel).optional(),
  status: z.enum(['active', 'inactive', 'locked']).optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  lastLoginAfter: z.date().optional(),
  lastLoginBefore: z.date().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(1000).default(50),
  sortBy: z.enum(['name', 'email', 'role', 'department', 'createdAt', 'lastLoginAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
});

export type UserSearchFilters = z.infer<typeof UserSearchFiltersSchema>;

// UserSession is already defined in database.ts

// User preferences
export const UserPreferencesSchema = z.object({
  userId: IDSchema,
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  language: z.string().default('en'),
  timezone: z.string().default('UTC'),
  dateFormat: z.string().default('YYYY-MM-DD'),
  timeFormat: z.enum(['12h', '24h']).default('24h'),
  notifications: z.object({
    email: z.boolean().default(true),
    browser: z.boolean().default(true),
    mobile: z.boolean().default(false)
  }).default({}),
  privacy: z.object({
    shareActivity: z.boolean().default(false),
    allowAnalytics: z.boolean().default(true),
    showOnlineStatus: z.boolean().default(true)
  }).default({}),
  accessibility: z.object({
    highContrast: z.boolean().default(false),
    largeText: z.boolean().default(false),
    reducedMotion: z.boolean().default(false)
  }).default({}),
  customSettings: z.record(z.any()).default({})
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>; 