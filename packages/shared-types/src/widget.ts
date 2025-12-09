import { z } from 'zod';
import { IDSchema, TimestampSchema } from './common.js';
import { SecurityLevel } from './security.js';

// Widget Permission Levels
export enum WidgetPermission {
  VIEW = 'view',
  INTERACT = 'interact',
  CONFIGURE = 'configure',
  MANAGE = 'manage',
  ADMIN = 'admin',
}

// Widget Categories for organization
export enum WidgetCategory {
  CORE = 'core',
  INTELLIGENCE = 'intelligence',
  COMMUNICATION = 'communication',
  MONITORING = 'monitoring',
  ANALYTICS = 'analytics',
  TOOLS = 'tools',
  SECURITY = 'security',
  SYSTEM = 'system',
  CUSTOM = 'custom',
}

// Widget Status
export enum WidgetStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BETA = 'beta',
  DEPRECATED = 'deprecated',
  MAINTENANCE = 'maintenance',
}

// Widget Size Configurations
export const WidgetSizeSchema = z.object({
  width: z.number().min(200).max(2000),
  height: z.number().min(150).max(1500),
  minWidth: z.number().min(200).optional(),
  minHeight: z.number().min(150).optional(),
  maxWidth: z.number().max(2000).optional(),
  maxHeight: z.number().max(1500).optional(),
  aspectRatio: z.number().positive().optional(),
});

// Responsive size configurations
export const ResponsiveSizeSchema = z.object({
  desktop: WidgetSizeSchema,
  tablet: WidgetSizeSchema,
  mobile: WidgetSizeSchema,
});

// Widget positioning
export const WidgetPositionSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  zIndex: z.number().min(0).optional(),
});

// Widget configuration schema
export const WidgetConfigSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  resizable: z.boolean().default(true),
  draggable: z.boolean().default(true),
  minimizable: z.boolean().default(true),
  maximizable: z.boolean().default(true),
  closable: z.boolean().default(true),
  refreshable: z.boolean().default(false),
  autoRefresh: z.number().min(0).optional(), // seconds
  persistState: z.boolean().default(true),
  showHeader: z.boolean().default(true),
  showFooter: z.boolean().default(false),
  customSettings: z.record(z.any()).optional(),
});

// Widget metadata
export const WidgetMetadataSchema = z.object({
  author: z.string().optional(),
  version: z.string().optional(),
  description: z.string().optional(),
  documentation: z.string().url().optional(),
  repository: z.string().url().optional(),
  license: z.string().optional(),
  tags: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  changelog: z
    .array(
      z.object({
        version: z.string(),
        date: z.string(),
        changes: z.array(z.string()),
      })
    )
    .optional(),
});

// Widget RBAC configuration
export const WidgetRBACSchema = z.object({
  requiredPermissions: z.array(z.nativeEnum(WidgetPermission)).default([WidgetPermission.VIEW]),
  requiredRoles: z.array(z.string()).default([]),
  requiredSecurityLevel: z.nativeEnum(SecurityLevel).default(SecurityLevel.LOW),
  allowedDepartments: z.array(z.string()).optional(),
  deniedUsers: z.array(IDSchema).default([]),
  allowedUsers: z.array(IDSchema).optional(),
  conditionalAccess: z
    .object({
      timeRestrictions: z
        .object({
          startTime: z.string().optional(), // HH:MM format
          endTime: z.string().optional(), // HH:MM format
          timezone: z.string().optional(),
          daysOfWeek: z.array(z.number().min(0).max(6)).optional(), // 0=Sunday
        })
        .optional(),
      ipRestrictions: z.array(z.string()).optional(),
      deviceRestrictions: z.array(z.string()).optional(),
    })
    .optional(),
});

// Base widget definition
export const BaseWidgetSchema = z.object({
  id: IDSchema,
  name: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  category: z.nativeEnum(WidgetCategory),
  status: z.nativeEnum(WidgetStatus).default(WidgetStatus.ACTIVE),
  version: z.string().default('1.0.0'),
  icon: z.string().optional(), // Icon component name or URL
  defaultSize: ResponsiveSizeSchema,
  config: WidgetConfigSchema.default({}),
  metadata: WidgetMetadataSchema.default({}),
  rbac: WidgetRBACSchema.default({}),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

// Widget instance (runtime instance of a widget)
export const WidgetInstanceSchema = BaseWidgetSchema.extend({
  instanceId: IDSchema,
  userId: IDSchema,
  position: WidgetPositionSchema,
  size: WidgetSizeSchema,
  isVisible: z.boolean().default(true),
  isMinimized: z.boolean().default(false),
  isMaximized: z.boolean().default(false),
  instanceConfig: z.record(z.any()).default({}),
  lastInteraction: z.date().optional(),
  sessionId: z.string().optional(),
});

// Widget registration request
export const WidgetRegistrationSchema = z.object({
  widget: BaseWidgetSchema.omit({ id: true, createdAt: true, updatedAt: true }),
  componentPath: z.string(), // Path to the widget component
  previewImage: z.string().url().optional(),
  registeredBy: IDSchema,
  registrationReason: z.string().optional(),
});

// Widget update request
export const WidgetUpdateSchema = BaseWidgetSchema.partial().omit({
  id: true,
  createdAt: true,
});

// Widget access request
export const WidgetAccessRequestSchema = z.object({
  widgetId: IDSchema,
  userId: IDSchema,
  requestedPermissions: z.array(z.nativeEnum(WidgetPermission)),
  justification: z.string().optional(),
  requestedBy: IDSchema.optional(),
  expiresAt: z.date().optional(),
});

// Widget access response
export const WidgetAccessResponseSchema = z.object({
  widgetId: IDSchema,
  userId: IDSchema,
  hasAccess: z.boolean(),
  grantedPermissions: z.array(z.nativeEnum(WidgetPermission)),
  deniedPermissions: z.array(z.nativeEnum(WidgetPermission)),
  accessLevel: z.nativeEnum(WidgetPermission),
  restrictions: z
    .object({
      timeRestricted: z.boolean().default(false),
      ipRestricted: z.boolean().default(false),
      deviceRestricted: z.boolean().default(false),
    })
    .optional(),
  expiresAt: z.date().optional(),
  reason: z.string().optional(),
});

// Widget registry query
export const WidgetRegistryQuerySchema = z.object({
  category: z.nativeEnum(WidgetCategory).optional(),
  status: z.nativeEnum(WidgetStatus).optional(),
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  requiredPermission: z.nativeEnum(WidgetPermission).optional(),
  userId: IDSchema.optional(), // Filter by user access
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'category', 'createdAt', 'lastUsed', 'popularity']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// Widget usage analytics
export const WidgetUsageSchema = z.object({
  widgetId: IDSchema,
  userId: IDSchema,
  action: z.enum(['open', 'close', 'interact', 'configure', 'error']),
  sessionId: z.string().optional(),
  duration: z.number().min(0).optional(), // seconds
  metadata: z.record(z.any()).optional(),
  timestamp: z.date().default(() => new Date()),
});

// Widget error reporting
export const WidgetErrorSchema = z.object({
  widgetId: IDSchema,
  instanceId: IDSchema.optional(),
  userId: IDSchema,
  error: z.object({
    name: z.string(),
    message: z.string(),
    stack: z.string().optional(),
    code: z.string().optional(),
  }),
  context: z
    .object({
      userAgent: z.string().optional(),
      viewport: z
        .object({
          width: z.number(),
          height: z.number(),
        })
        .optional(),
      url: z.string().optional(),
      timestamp: z.date().default(() => new Date()),
    })
    .optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  resolved: z.boolean().default(false),
});

// Type exports
export type WidgetSize = z.infer<typeof WidgetSizeSchema>;
export type ResponsiveSize = z.infer<typeof ResponsiveSizeSchema>;
export type WidgetPosition = z.infer<typeof WidgetPositionSchema>;
export type WidgetConfig = z.infer<typeof WidgetConfigSchema>;
export type WidgetMetadata = z.infer<typeof WidgetMetadataSchema>;
export type WidgetRBAC = z.infer<typeof WidgetRBACSchema>;
export type BaseWidget = z.infer<typeof BaseWidgetSchema>;
export type WidgetInstance = z.infer<typeof WidgetInstanceSchema>;
export type WidgetRegistration = z.infer<typeof WidgetRegistrationSchema>;
export type WidgetUpdate = z.infer<typeof WidgetUpdateSchema>;
export type WidgetAccessRequest = z.infer<typeof WidgetAccessRequestSchema>;
export type WidgetAccessResponse = z.infer<typeof WidgetAccessResponseSchema>;
export type WidgetRegistryQuery = z.infer<typeof WidgetRegistryQuerySchema>;
export type WidgetUsage = z.infer<typeof WidgetUsageSchema>;
export type WidgetError = z.infer<typeof WidgetErrorSchema>;
