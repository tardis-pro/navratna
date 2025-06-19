import { z } from 'zod';
import { BaseEntitySchema, IDSchema } from './common.js';

// Capability types
export enum CapabilityType {
  TOOL = 'tool',
  ARTIFACT = 'artifact',
  HYBRID = 'hybrid'
}

export enum CapabilityStatus {
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  DISABLED = 'disabled',
  EXPERIMENTAL = 'experimental'
}

// Tool capability
export const ToolCapabilitySchema = z.object({
  endpoint: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  authentication: z.object({
    type: z.enum(['none', 'api_key', 'oauth', 'jwt', 'basic']),
    config: z.record(z.any()).optional()
  }),
  parameters: z.array(z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    required: z.boolean().default(false),
    description: z.string().optional(),
    validation: z.record(z.any()).optional()
  })),
  responseSchema: z.record(z.any()).optional(),
  timeout: z.number().min(0).default(30000),
  retryPolicy: z.object({
    maxRetries: z.number().min(0).default(3),
    backoffStrategy: z.enum(['fixed', 'exponential']).default('exponential')
  }).optional()
});

export type ToolCapability = z.infer<typeof ToolCapabilitySchema>;

// Artifact capability
export const ArtifactTemplateSchema = z.object({
  templateEngine: z.enum(['handlebars', 'mustache', 'jinja2', 'ejs']).default('handlebars'),
  template: z.string(),
  outputFormat: z.enum(['text', 'json', 'yaml', 'xml', 'html', 'markdown', 'code']),
  variables: z.array(z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    required: z.boolean().default(false),
    description: z.string().optional(),
    defaultValue: z.any().optional()
  })),
  validationRules: z.array(z.object({
    field: z.string(),
    rule: z.string(),
    message: z.string()
  })).optional(),
  postProcessing: z.array(z.object({
    type: z.enum(['format', 'validate', 'transform']),
    config: z.record(z.any())
  })).optional()
});

export type ArtifactTemplate = z.infer<typeof ArtifactTemplateSchema>;

// Capability metadata
export const CapabilityMetadataSchema = z.object({
  version: z.string(),
  author: z.string().optional(),
  license: z.string().optional(),
  documentation: z.string().url().optional(),
  examples: z.array(z.record(z.any())).optional(),
  tags: z.array(z.string()),
  category: z.string(),
  subcategory: z.string().optional(),
  trustScore: z.number().min(0).max(10).default(5),
  usageCount: z.number().min(0).default(0),
  lastUsed: z.date().optional(),
  performance: z.object({
    averageLatency: z.number().min(0).optional(),
    successRate: z.number().min(0).max(1).optional(),
    errorRate: z.number().min(0).max(1).optional()
  }).optional()
});

export type CapabilityMetadata = z.infer<typeof CapabilityMetadataSchema>;

// Main capability entity
export const CapabilitySchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  description: z.string(),
  type: z.nativeEnum(CapabilityType),
  status: z.nativeEnum(CapabilityStatus).default(CapabilityStatus.ACTIVE),
  metadata: CapabilityMetadataSchema,
  toolConfig: ToolCapabilitySchema.optional(),
  artifactConfig: ArtifactTemplateSchema.optional(),
  dependencies: z.array(IDSchema).optional(),
  securityRequirements: z.object({
    minimumSecurityLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    requiredPermissions: z.array(z.string()),
    sensitiveData: z.boolean().default(false),
    auditRequired: z.boolean().default(false)
  }),
  resourceRequirements: z.object({
    cpu: z.number().min(0).optional(),
    memory: z.number().min(0).optional(),
    storage: z.number().min(0).optional(),
    network: z.boolean().default(false),
    estimatedDuration: z.number().min(0).optional()
  }).optional()
});

export type Capability = z.infer<typeof CapabilitySchema>;

// Capability search
export const CapabilitySearchRequestSchema = z.object({
  query: z.string().optional(),
  type: z.nativeEnum(CapabilityType).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  securityLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  includeDeprecated: z.boolean().default(false),
  sortBy: z.enum(['relevance', 'name', 'usage_count', 'trust_score', 'created_at']).default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});

export type CapabilitySearchRequest = z.infer<typeof CapabilitySearchRequestSchema>;

// Capability recommendation
export const CapabilityRecommendationSchema = z.object({
  capability: CapabilitySchema,
  relevanceScore: z.number().min(0).max(1),
  reasoning: z.string(),
  alternatives: z.array(IDSchema).optional(),
  usageExamples: z.array(z.record(z.any())).optional()
});

export type CapabilityRecommendation = z.infer<typeof CapabilityRecommendationSchema>;

// Capability relationship types
export enum CapabilityRelationshipType {
  DEPENDS_ON = 'depends_on',
  PROVIDES = 'provides',
  COMPOSES = 'composes',
  EXTENDS = 'extends',
  REPLACES = 'replaces',
  CONFLICTS_WITH = 'conflicts_with'
}

export const CapabilityRelationshipSchema = z.object({
  id: IDSchema,
  sourceId: IDSchema,
  targetId: IDSchema,
  type: z.nativeEnum(CapabilityRelationshipType),
  strength: z.number().min(0).max(1).default(1),
  metadata: z.record(z.any()).optional(),
  createdAt: z.date()
});

export type CapabilityRelationship = z.infer<typeof CapabilityRelationshipSchema>;

// Capability dependency graph
export const DependencyGraphSchema = z.object({
  capabilities: z.array(CapabilitySchema),
  relationships: z.array(CapabilityRelationshipSchema),
  executionOrder: z.array(IDSchema).optional(),
  potentialConflicts: z.array(z.object({
    capabilityIds: z.array(IDSchema),
    conflictType: z.string(),
    resolution: z.string().optional()
  })).optional()
});

export type DependencyGraph = z.infer<typeof DependencyGraphSchema>;

// Additional types for capability discovery service
export const CapabilitySearchQuerySchema = z.object({
  query: z.string(),
  type: z.nativeEnum(CapabilityType).optional(),
  agentContext: z.object({
    agentId: IDSchema,
    specializations: z.array(z.string())
  }).optional(),
  securityContext: z.object({
    securityLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    allowedCapabilities: z.array(z.string()).optional()
  }).optional(),
  limit: z.number().min(1).max(100).default(20)
});

export type CapabilitySearchQuery = z.infer<typeof CapabilitySearchQuerySchema>;

export const CapabilitySearchResultSchema = z.object({
  capabilities: z.array(CapabilitySchema),
  totalCount: z.number(),
  recommendations: z.array(z.string()),
  searchTime: z.number()
});

export type CapabilitySearchResult = z.infer<typeof CapabilitySearchResultSchema>;

// Capability registration request
export const CapabilityRegistrationRequestSchema = z.object({
  capability: CapabilitySchema,
  metadata: CapabilityMetadataSchema.optional(),
  securityPolicy: z.object({
    allowedUsers: z.array(z.string()).optional(),
    allowedRoles: z.array(z.string()).optional(),
    restrictedOperations: z.array(z.string()).optional(),
    auditLevel: z.enum(['none', 'basic', 'detailed']).default('basic')
  }).optional()
});

export type CapabilityRegistrationRequest = z.infer<typeof CapabilityRegistrationRequestSchema>; 