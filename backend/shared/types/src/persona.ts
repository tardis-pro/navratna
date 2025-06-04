import { z } from 'zod';
import { BaseEntitySchema, UUIDSchema } from './common.js';

// Persona trait types
export enum PersonaTraitType {
  PERSONALITY = 'personality',
  COMMUNICATION = 'communication',
  EXPERTISE = 'expertise',
  BEHAVIOR = 'behavior',
  COGNITIVE = 'cognitive'
}

export const PersonaTraitSchema = z.object({
  id: UUIDSchema,
  type: z.nativeEnum(PersonaTraitType),
  name: z.string().min(1).max(100),
  value: z.string().min(1).max(500),
  weight: z.number().min(0).max(1).default(1.0),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export type PersonaTrait = z.infer<typeof PersonaTraitSchema>;

// Expertise domain
export const ExpertiseDomainSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  level: z.enum(['beginner', 'intermediate', 'advanced', 'expert', 'master']),
  description: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  relatedDomains: z.array(UUIDSchema).default([])
});

export type ExpertiseDomain = z.infer<typeof ExpertiseDomainSchema>;

// Conversational style
export const ConversationalStyleSchema = z.object({
  tone: z.enum(['formal', 'casual', 'friendly', 'professional', 'academic', 'creative', 'analytical']),
  verbosity: z.enum(['concise', 'moderate', 'detailed', 'verbose']),
  formality: z.enum(['very_informal', 'informal', 'neutral', 'formal', 'very_formal']),
  empathy: z.number().min(0).max(1).default(0.5),
  assertiveness: z.number().min(0).max(1).default(0.5),
  creativity: z.number().min(0).max(1).default(0.5),
  analyticalDepth: z.number().min(0).max(1).default(0.5),
  questioningStyle: z.enum(['direct', 'socratic', 'exploratory', 'challenging', 'supportive']),
  responsePattern: z.enum(['structured', 'flowing', 'bullet_points', 'narrative', 'mixed']),
  culturalContext: z.string().optional(),
  languagePreferences: z.array(z.string()).default(['en']),
  communicationPreferences: z.object({
    usesAnalogies: z.boolean().default(true),
    usesExamples: z.boolean().default(true),
    usesHumor: z.boolean().default(false),
    usesEmoticons: z.boolean().default(false),
    prefersVisualAids: z.boolean().default(false)
  }).optional()
});

export type ConversationalStyle = z.infer<typeof ConversationalStyleSchema>;

// Persona status
export enum PersonaStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
  DEPRECATED = 'deprecated'
}

// Persona visibility
export enum PersonaVisibility {
  PRIVATE = 'private',
  TEAM = 'team',
  ORGANIZATION = 'organization',
  PUBLIC = 'public'
}

// Persona validation result
export const PersonaValidationSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
  score: z.number().min(0).max(100).optional(),
  validatedAt: z.date(),
  validatedBy: UUIDSchema.optional()
});

export type PersonaValidation = z.infer<typeof PersonaValidationSchema>;

// Persona usage statistics
export const PersonaUsageStatsSchema = z.object({
  totalUsages: z.number().min(0).default(0),
  uniqueUsers: z.number().min(0).default(0),
  averageSessionDuration: z.number().min(0).default(0),
  lastUsedAt: z.date().optional(),
  popularityScore: z.number().min(0).max(100).default(0),
  feedbackScore: z.number().min(0).max(5).optional(),
  feedbackCount: z.number().min(0).default(0)
});

export type PersonaUsageStats = z.infer<typeof PersonaUsageStatsSchema>;

// Main Persona schema
export const PersonaSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  role: z.string().min(1).max(255),
  description: z.string().min(1).max(2000),
  traits: z.array(PersonaTraitSchema).default([]),
  expertise: z.array(ExpertiseDomainSchema).default([]),
  background: z.string().min(1).max(5000),
  systemPrompt: z.string().min(1).max(10000),
  conversationalStyle: ConversationalStyleSchema,
  status: z.nativeEnum(PersonaStatus).default(PersonaStatus.DRAFT),
  visibility: z.nativeEnum(PersonaVisibility).default(PersonaVisibility.PRIVATE),
  createdBy: UUIDSchema,
  organizationId: UUIDSchema.optional(),
  teamId: UUIDSchema.optional(),
  version: z.number().min(1).default(1),
  parentPersonaId: UUIDSchema.optional(), // For persona derivation
  tags: z.array(z.string()).default([]),
  validation: PersonaValidationSchema.optional(),
  usageStats: PersonaUsageStatsSchema.default({}),
  configuration: z.object({
    maxTokens: z.number().min(1).default(4000),
    temperature: z.number().min(0).max(2).default(0.7),
    topP: z.number().min(0).max(1).default(0.9),
    frequencyPenalty: z.number().min(-2).max(2).default(0),
    presencePenalty: z.number().min(-2).max(2).default(0),
    stopSequences: z.array(z.string()).default([])
  }).optional(),
  capabilities: z.array(UUIDSchema).default([]), // Link to capability IDs
  restrictions: z.object({
    allowedTopics: z.array(z.string()).default([]),
    forbiddenTopics: z.array(z.string()).default([]),
    maxSessionDuration: z.number().min(0).optional(),
    maxMessagesPerSession: z.number().min(0).optional(),
    requiresApproval: z.boolean().default(false)
  }).optional(),
  metadata: z.record(z.any()).optional()
});

export type Persona = z.infer<typeof PersonaSchema>;

// Persona creation request
export const CreatePersonaRequestSchema = PersonaSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  usageStats: true,
  validation: true,
  createdBy: true
}).extend({
  createdBy: UUIDSchema.optional() // Make createdBy optional since it's set from auth
});

export type CreatePersonaRequest = z.infer<typeof CreatePersonaRequestSchema>;

// Persona update request
export const UpdatePersonaRequestSchema = PersonaSchema.partial().omit({
  id: true,
  createdAt: true,
  createdBy: true
});

export type UpdatePersonaRequest = z.infer<typeof UpdatePersonaRequestSchema>;

// Persona search filters
export const PersonaSearchFiltersSchema = z.object({
  query: z.string().optional(),
  expertise: z.array(z.string()).optional(),
  traits: z.array(z.string()).optional(),
  status: z.array(z.nativeEnum(PersonaStatus)).optional(),
  visibility: z.array(z.nativeEnum(PersonaVisibility)).optional(),
  createdBy: z.array(UUIDSchema).optional(),
  organizationId: UUIDSchema.optional(),
  teamId: UUIDSchema.optional(),
  tags: z.array(z.string()).optional(),
  minUsageCount: z.number().min(0).optional(),
  minFeedbackScore: z.number().min(0).max(5).optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  lastUsedAfter: z.date().optional(),
  lastUsedBefore: z.date().optional()
});

export type PersonaSearchFilters = z.infer<typeof PersonaSearchFiltersSchema>;

// Persona recommendation
export const PersonaRecommendationSchema = z.object({
  persona: PersonaSchema,
  score: z.number().min(0).max(1),
  reason: z.string(),
  matchingCriteria: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.any()).optional()
});

export type PersonaRecommendation = z.infer<typeof PersonaRecommendationSchema>;

// Persona analytics
export const PersonaAnalyticsSchema = z.object({
  personaId: UUIDSchema,
  timeframe: z.object({
    start: z.date(),
    end: z.date()
  }),
  metrics: z.object({
    totalSessions: z.number().min(0),
    totalMessages: z.number().min(0),
    averageSessionDuration: z.number().min(0),
    uniqueUsers: z.number().min(0),
    satisfactionScore: z.number().min(0).max(5).optional(),
    completionRate: z.number().min(0).max(1),
    errorRate: z.number().min(0).max(1)
  }),
  trends: z.object({
    usageGrowth: z.number(),
    satisfactionTrend: z.number(),
    popularityRank: z.number().min(1)
  }),
  topInteractions: z.array(z.object({
    type: z.string(),
    count: z.number(),
    averageDuration: z.number()
  })),
  commonIssues: z.array(z.object({
    issue: z.string(),
    frequency: z.number(),
    severity: z.enum(['low', 'medium', 'high'])
  }))
});

export type PersonaAnalytics = z.infer<typeof PersonaAnalyticsSchema>;

// Persona template for quick creation
export const PersonaTemplateSchema = z.object({
  id: UUIDSchema,
  name: z.string(),
  category: z.string(),
  description: z.string(),
  template: PersonaSchema.omit({ id: true, createdAt: true, updatedAt: true, createdBy: true }),
  isPublic: z.boolean().default(false),
  usageCount: z.number().min(0).default(0),
  rating: z.number().min(0).max(5).optional(),
  createdBy: UUIDSchema,
  createdAt: z.date(),
  updatedAt: z.date()
});

export type PersonaTemplate = z.infer<typeof PersonaTemplateSchema>;

// Export all schemas for validation
export const PersonaSchemas = {
  PersonaTrait: PersonaTraitSchema,
  ExpertiseDomain: ExpertiseDomainSchema,
  ConversationalStyle: ConversationalStyleSchema,
  PersonaValidation: PersonaValidationSchema,
  PersonaUsageStats: PersonaUsageStatsSchema,
  Persona: PersonaSchema,
  CreatePersonaRequest: CreatePersonaRequestSchema,
  UpdatePersonaRequest: UpdatePersonaRequestSchema,
  PersonaSearchFilters: PersonaSearchFiltersSchema,
  PersonaRecommendation: PersonaRecommendationSchema,
  PersonaAnalytics: PersonaAnalyticsSchema,
  PersonaTemplate: PersonaTemplateSchema
}; 