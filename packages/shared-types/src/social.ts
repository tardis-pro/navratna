import { z } from 'zod';
import { BaseEntitySchema, IDSchema } from './common.js';

// Social activity types
export enum SocialActivityType {
  AGENT_SHARED = 'agent_shared',
  AGENT_LIKED = 'agent_liked',
  AGENT_FORKED = 'agent_forked',
  AGENT_REMIXED = 'agent_remixed',
  BATTLE_WON = 'battle_won',
  BATTLE_PARTICIPATED = 'battle_participated',
  ACHIEVEMENT_EARNED = 'achievement_earned',
  LEADERBOARD_RANK = 'leaderboard_rank',
  COLLABORATION_CREATED = 'collaboration_created',
  SHOWCASE_FEATURED = 'showcase_featured',
  USER_FOLLOWED = 'user_followed',
  COMMENT_POSTED = 'comment_posted',
}

// Content visibility levels
export enum ContentVisibility {
  PUBLIC = 'public',
  FOLLOWERS = 'followers',
  PRIVATE = 'private',
}

// User profile schema
export const UserProfileSchema = BaseEntitySchema.extend({
  id: IDSchema,
  userId: IDSchema,
  username: z.string().min(3).max(30),
  displayName: z.string().max(100),
  bio: z.string().max(500).optional(),
  avatar: z.string().optional(),
  banner: z.string().optional(),
  location: z.string().max(100).optional(),
  website: z.string().url().optional(),

  // Stats
  followersCount: z.number().min(0).default(0),
  followingCount: z.number().min(0).default(0),
  totalLikes: z.number().min(0).default(0),
  totalShares: z.number().min(0).default(0),
  totalAgents: z.number().min(0).default(0),
  totalBattles: z.number().min(0).default(0),

  // Preferences
  isPublic: z.boolean().default(true),
  allowMessages: z.boolean().default(true),
  allowFollows: z.boolean().default(true),
  showActivity: z.boolean().default(true),
  showStats: z.boolean().default(true),

  // Verification
  isVerified: z.boolean().default(false),
  verifiedAt: z.date().optional(),

  // Social links
  socialLinks: z
    .array(
      z.object({
        platform: z.string(),
        url: z.string().url(),
        handle: z.string().optional(),
      })
    )
    .default([]),

  // Achievements and badges
  badges: z.array(z.string()).default([]),
  achievements: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        icon: z.string(),
        earnedAt: z.date(),
        rarity: z.enum(['common', 'rare', 'epic', 'legendary']),
      })
    )
    .default([]),

  metadata: z.record(z.any()).optional(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

// Social post schema
export const SocialPostSchema = BaseEntitySchema.extend({
  id: IDSchema,
  authorId: IDSchema,
  authorName: z.string(),
  authorAvatar: z.string().optional(),

  // Content
  content: z.string().max(2000),
  images: z.array(z.string()).default([]),
  videos: z.array(z.string()).default([]),

  // References
  agentId: IDSchema.optional(),
  battleId: IDSchema.optional(),
  sharedPostId: IDSchema.optional(), // For reposts

  // Post type and metadata
  type: z.enum(['text', 'agent_share', 'battle_highlight', 'achievement', 'media']),
  visibility: z.nativeEnum(ContentVisibility).default(ContentVisibility.PUBLIC),

  // Engagement
  likesCount: z.number().min(0).default(0),
  sharesCount: z.number().min(0).default(0),
  commentsCount: z.number().min(0).default(0),
  viewsCount: z.number().min(0).default(0),

  // Viral metrics
  viralScore: z.number().min(0).default(0),
  reachCount: z.number().min(0).default(0),
  engagementRate: z.number().min(0).max(1).default(0),

  // Content moderation
  isReported: z.boolean().default(false),
  isFlagged: z.boolean().default(false),
  moderationStatus: z.enum(['pending', 'approved', 'rejected']).default('approved'),

  // Hashtags and mentions
  hashtags: z.array(z.string()).default([]),
  mentions: z.array(IDSchema).default([]),

  metadata: z.record(z.any()).optional(),
});

export type SocialPost = z.infer<typeof SocialPostSchema>;

// Social activity feed item
export const SocialActivitySchema = BaseEntitySchema.extend({
  id: IDSchema,
  userId: IDSchema,
  actorId: IDSchema, // User who performed the action
  actorName: z.string(),
  actorAvatar: z.string().optional(),

  type: z.nativeEnum(SocialActivityType),

  // Activity content
  title: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),

  // References
  targetId: IDSchema.optional(), // ID of the target (agent, battle, etc.)
  targetType: z.enum(['agent', 'battle', 'user', 'post']).optional(),
  targetName: z.string().optional(),

  // Additional data
  data: z.record(z.any()).default({}),

  // Visibility and grouping
  visibility: z.nativeEnum(ContentVisibility).default(ContentVisibility.PUBLIC),
  groupKey: z.string().optional(), // For grouping similar activities

  isRead: z.boolean().default(false),
  isGrouped: z.boolean().default(false),
});

export type SocialActivity = z.infer<typeof SocialActivitySchema>;

// Social comment schema
export const SocialCommentSchema = BaseEntitySchema.extend({
  id: IDSchema,
  postId: IDSchema,
  authorId: IDSchema,
  authorName: z.string(),
  authorAvatar: z.string().optional(),

  content: z.string().max(1000),
  parentCommentId: IDSchema.optional(), // For replies

  // Engagement
  likesCount: z.number().min(0).default(0),
  repliesCount: z.number().min(0).default(0),

  // Moderation
  isReported: z.boolean().default(false),
  isFlagged: z.boolean().default(false),

  // Mentions
  mentions: z.array(IDSchema).default([]),

  metadata: z.record(z.any()).optional(),
});

export type SocialComment = z.infer<typeof SocialCommentSchema>;

// Follow relationship schema
export const FollowRelationshipSchema = BaseEntitySchema.extend({
  id: IDSchema,
  followerId: IDSchema,
  followeeId: IDSchema,

  // Follow metadata
  isAccepted: z.boolean().default(true), // For private accounts
  notifications: z.boolean().default(true),

  // Interaction stats
  lastInteractionAt: z.date().optional(),
  interactionCount: z.number().min(0).default(0),
});

export type FollowRelationship = z.infer<typeof FollowRelationshipSchema>;

// Agent showcase schema
export const AgentShowcaseSchema = BaseEntitySchema.extend({
  id: IDSchema,
  agentId: IDSchema,
  agentName: z.string(),
  ownerId: IDSchema,
  ownerName: z.string(),

  // Showcase content
  title: z.string().max(200),
  description: z.string().max(2000),
  coverImage: z.string().optional(),

  // Demo and examples
  demoVideo: z.string().optional(),
  liveDemo: z
    .object({
      isAvailable: z.boolean(),
      url: z.string().optional(),
      instructions: z.string().optional(),
    })
    .optional(),

  examples: z
    .array(
      z.object({
        title: z.string(),
        input: z.string(),
        output: z.string(),
        explanation: z.string().optional(),
      })
    )
    .default([]),

  // Performance highlights
  highlights: z
    .array(
      z.object({
        metric: z.string(),
        value: z.string(),
        description: z.string(),
        icon: z.string().optional(),
      })
    )
    .default([]),

  // Social metrics
  viewsCount: z.number().min(0).default(0),
  likesCount: z.number().min(0).default(0),
  sharesCount: z.number().min(0).default(0),
  clonesCount: z.number().min(0).default(0),

  // Visibility and discovery
  visibility: z.nativeEnum(ContentVisibility).default(ContentVisibility.PUBLIC),
  tags: z.array(z.string()).default([]),
  isFeatured: z.boolean().default(false),
  featuredUntil: z.date().optional(),

  metadata: z.record(z.any()).optional(),
});

export type AgentShowcase = z.infer<typeof AgentShowcaseSchema>;

// Trending content schema
export const TrendingContentSchema = z.object({
  id: IDSchema,
  type: z.enum(['agent', 'post', 'hashtag', 'user', 'battle']),
  targetId: IDSchema,
  name: z.string(),
  description: z.string().optional(),

  // Trending metrics
  score: z.number().min(0),
  velocity: z.number(),
  peakScore: z.number().min(0),

  // Time-based metrics
  views24h: z.number().min(0).default(0),
  likes24h: z.number().min(0).default(0),
  shares24h: z.number().min(0).default(0),
  comments24h: z.number().min(0).default(0),

  // Rank and position
  currentRank: z.number().min(1),
  previousRank: z.number().min(1).optional(),
  rankChange: z.number(),

  // Metadata
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),

  lastUpdated: z.date(),
});

export type TrendingContent = z.infer<typeof TrendingContentSchema>;

// Social engagement metrics
export const EngagementMetricsSchema = z.object({
  entityId: IDSchema,
  entityType: z.enum(['post', 'agent', 'user', 'battle']),

  // Basic metrics
  views: z.number().min(0).default(0),
  likes: z.number().min(0).default(0),
  shares: z.number().min(0).default(0),
  comments: z.number().min(0).default(0),

  // Advanced metrics
  reach: z.number().min(0).default(0),
  impressions: z.number().min(0).default(0),
  clickThrough: z.number().min(0).default(0),
  conversions: z.number().min(0).default(0),

  // Calculated metrics
  engagementRate: z.number().min(0).max(1).default(0),
  viralityCoefficient: z.number().min(0).default(0),

  // Time-based breakdown
  dailyMetrics: z
    .array(
      z.object({
        date: z.date(),
        views: z.number().min(0),
        likes: z.number().min(0),
        shares: z.number().min(0),
        comments: z.number().min(0),
      })
    )
    .default([]),

  lastUpdated: z.date(),
});

export type EngagementMetrics = z.infer<typeof EngagementMetricsSchema>;

// Feed item union type
export const FeedItemSchema = z.object({
  id: IDSchema,
  type: z.enum(['post', 'activity', 'suggestion', 'trending']),
  timestamp: z.date(),
  priority: z.number().min(0).max(1).default(0.5),

  // Content based on type
  post: SocialPostSchema.optional(),
  activity: SocialActivitySchema.optional(),
  trendingContent: TrendingContentSchema.optional(),

  // Feed metadata
  isPromoted: z.boolean().default(false),
  isSeen: z.boolean().default(false),
  interactionScore: z.number().min(0).default(0),
});

export type FeedItem = z.infer<typeof FeedItemSchema>;

// Export all schemas
export const SocialSchemas = {
  UserProfile: UserProfileSchema,
  SocialPost: SocialPostSchema,
  SocialActivity: SocialActivitySchema,
  SocialComment: SocialCommentSchema,
  FollowRelationship: FollowRelationshipSchema,
  AgentShowcase: AgentShowcaseSchema,
  TrendingContent: TrendingContentSchema,
  EngagementMetrics: EngagementMetricsSchema,
  FeedItem: FeedItemSchema,
};
