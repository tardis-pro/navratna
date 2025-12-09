import { z } from 'zod';
import { BaseEntitySchema, IDSchema } from './common.js';

// Marketplace item types
export enum MarketplaceItemType {
  AGENT = 'agent',
  PERSONA = 'persona',
  TOOL = 'tool',
  CAPABILITY = 'capability',
  WORKFLOW = 'workflow',
  TEMPLATE = 'template',
}

// Marketplace categories
export enum MarketplaceCategory {
  PRODUCTIVITY = 'productivity',
  CREATIVE = 'creative',
  ANALYSIS = 'analysis',
  COMMUNICATION = 'communication',
  DEVELOPMENT = 'development',
  EDUCATION = 'education',
  ENTERTAINMENT = 'entertainment',
  BUSINESS = 'business',
  RESEARCH = 'research',
  AUTOMATION = 'automation',
}

// Marketplace item status
export enum MarketplaceItemStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  FEATURED = 'featured',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
}

// Marketplace pricing model
export enum PricingModel {
  FREE = 'free',
  FREEMIUM = 'freemium',
  PREMIUM = 'premium',
  PAY_PER_USE = 'pay_per_use',
  SUBSCRIPTION = 'subscription',
}

// Marketplace rating schema
export const MarketplaceRatingSchema = z.object({
  id: IDSchema,
  itemId: IDSchema,
  userId: IDSchema,
  rating: z.number().min(1).max(5),
  review: z.string().max(2000).optional(),
  isVerified: z.boolean().default(false),
  helpful: z.number().min(0).default(0),
  reported: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type MarketplaceRating = z.infer<typeof MarketplaceRatingSchema>;

// Marketplace usage stats
export const MarketplaceUsageStatsSchema = z.object({
  totalDownloads: z.number().min(0).default(0),
  totalInstalls: z.number().min(0).default(0),
  totalViews: z.number().min(0).default(0),
  totalForks: z.number().min(0).default(0),
  totalLikes: z.number().min(0).default(0),
  activeUsers: z.number().min(0).default(0),
  averageRating: z.number().min(0).max(5).optional(),
  totalRatings: z.number().min(0).default(0),
  weeklyDownloads: z.number().min(0).default(0),
  monthlyDownloads: z.number().min(0).default(0),
  conversionRate: z.number().min(0).max(1).default(0),
  retentionRate: z.number().min(0).max(1).default(0),
});

export type MarketplaceUsageStats = z.infer<typeof MarketplaceUsageStatsSchema>;

// Marketplace item showcase
export const MarketplaceShowcaseSchema = z.object({
  screenshots: z.array(z.string()).default([]),
  videos: z.array(z.string()).default([]),
  demos: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        url: z.string(),
        type: z.enum(['video', 'interactive', 'code', 'live']),
      })
    )
    .default([]),
  examples: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        input: z.string(),
        output: z.string(),
        tags: z.array(z.string()).default([]),
      })
    )
    .default([]),
  testimonials: z
    .array(
      z.object({
        user: z.string(),
        comment: z.string(),
        rating: z.number().min(1).max(5),
        verified: z.boolean().default(false),
      })
    )
    .default([]),
});

export type MarketplaceShowcase = z.infer<typeof MarketplaceShowcaseSchema>;

// Main marketplace item schema
export const MarketplaceItemSchema = BaseEntitySchema.extend({
  id: IDSchema,
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(2000),
  longDescription: z.string().max(10000).optional(),
  type: z.nativeEnum(MarketplaceItemType),
  category: z.nativeEnum(MarketplaceCategory),
  tags: z.array(z.string()).default([]),
  status: z.nativeEnum(MarketplaceItemStatus).default(MarketplaceItemStatus.DRAFT),
  visibility: z.enum(['public', 'unlisted', 'private']).default('public'),

  // Author information
  authorId: IDSchema,
  authorName: z.string(),
  authorAvatar: z.string().optional(),
  organizationId: IDSchema.optional(),

  // Content references
  personaId: IDSchema.optional(), // For persona-based items
  agentId: IDSchema.optional(), // For agent-based items
  toolId: IDSchema.optional(), // For tool-based items

  // Marketplace specific fields
  version: z.string().default('1.0.0'),
  pricing: z.object({
    model: z.nativeEnum(PricingModel),
    price: z.number().min(0).default(0),
    currency: z.string().default('USD'),
    billingPeriod: z.enum(['one_time', 'monthly', 'yearly']).optional(),
    trialDays: z.number().min(0).optional(),
  }),

  // Usage and performance
  stats: MarketplaceUsageStatsSchema.default({}),
  showcase: MarketplaceShowcaseSchema.default({}),

  // Compatibility and requirements
  requirements: z
    .object({
      minVersion: z.string().optional(),
      dependencies: z.array(z.string()).default([]),
      capabilities: z.array(z.string()).default([]),
      resourceRequirements: z
        .object({
          minMemory: z.number().optional(),
          minCpu: z.number().optional(),
          maxExecutionTime: z.number().optional(),
        })
        .optional(),
    })
    .optional(),

  // Social features
  isForkable: z.boolean().default(true),
  isRemixable: z.boolean().default(true),
  originalItemId: IDSchema.optional(), // For forks/remixes
  forkedFrom: IDSchema.optional(),

  // Featured and trending
  isFeatured: z.boolean().default(false),
  isTrending: z.boolean().default(false),
  featuredUntil: z.date().optional(),
  trendingScore: z.number().min(0).default(0),

  // Quality and safety
  qualityScore: z.number().min(0).max(100).optional(),
  safetyScore: z.number().min(0).max(100).optional(),
  isVerified: z.boolean().default(false),
  verifiedBy: IDSchema.optional(),
  verifiedAt: z.date().optional(),

  metadata: z.record(z.any()).optional(),
});

export type MarketplaceItem = z.infer<typeof MarketplaceItemSchema>;

// Marketplace search filters
export const MarketplaceSearchFiltersSchema = z.object({
  query: z.string().optional(),
  type: z.array(z.nativeEnum(MarketplaceItemType)).optional(),
  category: z.array(z.nativeEnum(MarketplaceCategory)).optional(),
  tags: z.array(z.string()).optional(),
  author: z.array(IDSchema).optional(),
  pricing: z.array(z.nativeEnum(PricingModel)).optional(),
  minRating: z.number().min(0).max(5).optional(),
  minDownloads: z.number().min(0).optional(),
  featured: z.boolean().optional(),
  trending: z.boolean().optional(),
  verified: z.boolean().optional(),
  sortBy: z
    .enum(['name', 'downloads', 'rating', 'created', 'updated', 'trending'])
    .default('trending'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export type MarketplaceSearchFilters = z.infer<typeof MarketplaceSearchFiltersSchema>;

// Marketplace installation/usage tracking
export const MarketplaceInstallationSchema = BaseEntitySchema.extend({
  id: IDSchema,
  itemId: IDSchema,
  userId: IDSchema,
  version: z.string(),
  installedAt: z.date(),
  lastUsedAt: z.date().optional(),
  usageCount: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
  feedback: z
    .object({
      rating: z.number().min(1).max(5).optional(),
      review: z.string().max(1000).optional(),
      wouldRecommend: z.boolean().optional(),
    })
    .optional(),
});

export type MarketplaceInstallation = z.infer<typeof MarketplaceInstallationSchema>;

// Collection schema for curated lists
export const MarketplaceCollectionSchema = BaseEntitySchema.extend({
  id: IDSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(1000),
  curatorId: IDSchema,
  curatorName: z.string(),
  items: z.array(IDSchema),
  isPublic: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  stats: z
    .object({
      followers: z.number().min(0).default(0),
      totalViews: z.number().min(0).default(0),
      totalLikes: z.number().min(0).default(0),
    })
    .default({}),
});

export type MarketplaceCollection = z.infer<typeof MarketplaceCollectionSchema>;

// Trending algorithm data
export const TrendingDataSchema = z.object({
  itemId: IDSchema,
  views24h: z.number().min(0).default(0),
  downloads24h: z.number().min(0).default(0),
  likes24h: z.number().min(0).default(0),
  forks24h: z.number().min(0).default(0),
  comments24h: z.number().min(0).default(0),
  velocity: z.number().default(0),
  acceleration: z.number().default(0),
  trendingScore: z.number().min(0).default(0),
  updatedAt: z.date(),
});

export type TrendingData = z.infer<typeof TrendingDataSchema>;

// Export all schemas
export const MarketplaceSchemas = {
  MarketplaceRating: MarketplaceRatingSchema,
  MarketplaceUsageStats: MarketplaceUsageStatsSchema,
  MarketplaceShowcase: MarketplaceShowcaseSchema,
  MarketplaceItem: MarketplaceItemSchema,
  MarketplaceSearchFilters: MarketplaceSearchFiltersSchema,
  MarketplaceInstallation: MarketplaceInstallationSchema,
  MarketplaceCollection: MarketplaceCollectionSchema,
  TrendingData: TrendingDataSchema,
};
