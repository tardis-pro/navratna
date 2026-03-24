import { z } from 'zod';
import { BaseEntitySchema, IDSchema } from './common.js';

// Battle types
export enum BattleType {
  CODING_CHALLENGE = 'coding_challenge',
  DEBATE = 'debate',
  CREATIVE_WRITING = 'creative_writing',
  PROBLEM_SOLVING = 'problem_solving',
  TRIVIA = 'trivia',
  STORYTELLING = 'storytelling',
  CODE_REVIEW = 'code_review',
  MARKETING_PITCH = 'marketing_pitch',
}

// Battle status
export enum BattleStatus {
  CREATED = 'created',
  MATCHMAKING = 'matchmaking',
  STARTING = 'starting',
  IN_PROGRESS = 'in_progress',
  JUDGING = 'judging',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// Battle participant role
export enum BattleParticipantRole {
  COMPETITOR = 'competitor',
  SPECTATOR = 'spectator',
  JUDGE = 'judge',
  MODERATOR = 'moderator',
}

// Battle judging criteria
export const JudgingCriteriaSchema = z.object({
  name: z.string(),
  description: z.string(),
  maxScore: z.number().min(1).max(100).default(10),
  weight: z.number().min(0).max(1).default(1.0),
});

export type JudgingCriteria = z.infer<typeof JudgingCriteriaSchema>;

// Battle settings
export const BattleSettingsSchema = z.object({
  maxParticipants: z.number().min(2).max(8).default(2),
  timeLimit: z.number().min(60).max(3600).default(600), // seconds
  roundCount: z.number().min(1).max(10).default(1),
  autoJudging: z.boolean().default(false),
  allowSpectators: z.boolean().default(true),
  spectatorBetting: z.boolean().default(false),
  prizePool: z.number().min(0).default(0),
  entryFee: z.number().min(0).default(0),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).default('intermediate'),
  tags: z.array(z.string()).default([]),
});

export type BattleSettings = z.infer<typeof BattleSettingsSchema>;

// Battle participant
export const BattleParticipantSchema = z.object({
  id: IDSchema,
  battleId: IDSchema,
  agentId: IDSchema,
  agentName: z.string(),
  userId: IDSchema,
  userName: z.string(),
  role: z.nativeEnum(BattleParticipantRole),
  joinedAt: z.date(),
  isReady: z.boolean().default(false),
  score: z.number().min(0).default(0),
  rank: z.number().min(1).optional(),
  submission: z.string().optional(),
  submittedAt: z.date().optional(),
  performance: z
    .object({
      responseTime: z.number().optional(),
      creativity: z.number().min(0).max(10).optional(),
      accuracy: z.number().min(0).max(10).optional(),
      efficiency: z.number().min(0).max(10).optional(),
      engagement: z.number().min(0).max(10).optional(),
    })
    .optional(),
  metadata: z.record(z.any()).optional(),
});

export type BattleParticipant = z.infer<typeof BattleParticipantSchema>;

// Battle round
export const BattleRoundSchema = z.object({
  id: IDSchema,
  battleId: IDSchema,
  roundNumber: z.number().min(1),
  prompt: z.string(),
  status: z.enum(['waiting', 'active', 'judging', 'completed']),
  startedAt: z.date().optional(),
  endedAt: z.date().optional(),
  timeLimit: z.number().min(0),
  submissions: z
    .array(
      z.object({
        participantId: IDSchema,
        content: z.string(),
        submittedAt: z.date(),
        metadata: z.record(z.any()).optional(),
      })
    )
    .default([]),
  scores: z
    .array(
      z.object({
        participantId: IDSchema,
        judgeId: IDSchema,
        criteriaScores: z.record(z.number()),
        totalScore: z.number(),
        feedback: z.string().optional(),
      })
    )
    .default([]),
  winner: IDSchema.optional(),
});

export type BattleRound = z.infer<typeof BattleRoundSchema>;

// Battle live event
export const BattleLiveEventSchema = z.object({
  id: IDSchema,
  battleId: IDSchema,
  type: z.enum([
    'participant_joined',
    'battle_started',
    'round_started',
    'submission_received',
    'round_ended',
    'battle_ended',
    'spectator_message',
    'judge_comment',
  ]),
  participantId: IDSchema.optional(),
  data: z.record(z.any()),
  timestamp: z.date(),
  isPublic: z.boolean().default(true),
});

export type BattleLiveEvent = z.infer<typeof BattleLiveEventSchema>;

// Main battle schema
export const BattleSchema = BaseEntitySchema.extend({
  id: IDSchema,
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  type: z.nativeEnum(BattleType),
  status: z.nativeEnum(BattleStatus).default(BattleStatus.CREATED),

  // Battle configuration
  settings: BattleSettingsSchema,
  judgingCriteria: z.array(JudgingCriteriaSchema).default([]),

  // Timing
  scheduledStartTime: z.date().optional(),
  actualStartTime: z.date().optional(),
  endTime: z.date().optional(),

  // Creator info
  createdBy: IDSchema,
  creatorName: z.string(),

  // Participants
  participants: z.array(BattleParticipantSchema).default([]),
  maxParticipants: z.number().min(2).max(8).default(2),
  currentParticipants: z.number().min(0).default(0),

  // Battle state
  currentRound: z.number().min(0).default(0),
  totalRounds: z.number().min(1).default(1),
  rounds: z.array(BattleRoundSchema).default([]),

  // Results
  winner: BattleParticipantSchema.optional(),
  finalScores: z
    .array(
      z.object({
        participantId: IDSchema,
        agentName: z.string(),
        totalScore: z.number(),
        rank: z.number(),
        badges: z.array(z.string()).default([]),
      })
    )
    .default([]),

  // Engagement
  spectatorCount: z.number().min(0).default(0),
  totalViews: z.number().min(0).default(0),
  likes: z.number().min(0).default(0),
  chatMessages: z.number().min(0).default(0),

  // Viral metrics
  viralScore: z.number().min(0).default(0),
  shareCount: z.number().min(0).default(0),
  clipCount: z.number().min(0).default(0), // number of highlights created

  // Monetization
  prizePool: z.number().min(0).default(0),
  sponsorshipAmount: z.number().min(0).default(0),
  ticketRevenue: z.number().min(0).default(0),

  metadata: z.record(z.any()).optional(),
});

export type Battle = z.infer<typeof BattleSchema>;

// Battle creation request
export const CreateBattleRequestSchema = BattleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  participants: true,
  currentParticipants: true,
  currentRound: true,
  rounds: true,
  winner: true,
  finalScores: true,
  spectatorCount: true,
  totalViews: true,
  likes: true,
  chatMessages: true,
  viralScore: true,
  shareCount: true,
  clipCount: true,
  ticketRevenue: true,
});

export type CreateBattleRequest = z.infer<typeof CreateBattleRequestSchema>;

// Battle search filters
export const BattleSearchFiltersSchema = z.object({
  query: z.string().optional(),
  type: z.array(z.nativeEnum(BattleType)).optional(),
  status: z.array(z.nativeEnum(BattleStatus)).optional(),
  skillLevel: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  createdBy: z.array(IDSchema).optional(),
  hasOpenSlots: z.boolean().optional(),
  hasPrizePool: z.boolean().optional(),
  startTimeAfter: z.date().optional(),
  startTimeBefore: z.date().optional(),
  sortBy: z.enum(['created', 'startTime', 'prizePool', 'participants', 'viral']).default('created'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export type BattleSearchFilters = z.infer<typeof BattleSearchFiltersSchema>;

// Battle analytics
export const BattleAnalyticsSchema = z.object({
  battleId: IDSchema,
  duration: z.number(), // seconds
  averageResponseTime: z.number(),
  participantEngagement: z.number().min(0).max(1),
  spectatorEngagement: z.number().min(0).max(1),
  viralMetrics: z.object({
    peakViewers: z.number(),
    shareRate: z.number(),
    commentRate: z.number(),
    clipCreationRate: z.number(),
  }),
  qualityMetrics: z.object({
    averageSubmissionQuality: z.number().min(0).max(10),
    judgeConsistency: z.number().min(0).max(1),
    audienceSatisfaction: z.number().min(0).max(5),
  }),
});

export type BattleAnalytics = z.infer<typeof BattleAnalyticsSchema>;

// Leaderboard entry
export const LeaderboardEntrySchema = z.object({
  rank: z.number().min(1),
  agentId: IDSchema,
  agentName: z.string(),
  userId: IDSchema,
  userName: z.string(),
  avatar: z.string().optional(),

  // Battle stats
  totalBattles: z.number().min(0).default(0),
  wins: z.number().min(0).default(0),
  losses: z.number().min(0).default(0),
  winRate: z.number().min(0).max(1).default(0),

  // Performance metrics
  averageScore: z.number().min(0).default(0),
  totalScore: z.number().min(0).default(0),
  bestScore: z.number().min(0).default(0),
  averageRank: z.number().min(1).default(1),

  // Engagement
  totalSpectators: z.number().min(0).default(0),
  totalLikes: z.number().min(0).default(0),
  fanCount: z.number().min(0).default(0),

  // Achievements
  badges: z.array(z.string()).default([]),
  titles: z.array(z.string()).default([]),
  streaks: z
    .object({
      current: z.number().min(0).default(0),
      longest: z.number().min(0).default(0),
    })
    .default({ current: 0, longest: 0 }),

  // Specialties
  bestCategories: z.array(z.nativeEnum(BattleType)).default([]),
  skillRating: z.number().min(0).max(3000).default(1000), // ELO-style rating

  lastBattleAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

// Export all schemas
export const BattleSchemas = {
  JudgingCriteria: JudgingCriteriaSchema,
  BattleSettings: BattleSettingsSchema,
  BattleParticipant: BattleParticipantSchema,
  BattleRound: BattleRoundSchema,
  BattleLiveEvent: BattleLiveEventSchema,
  Battle: BattleSchema,
  CreateBattleRequest: CreateBattleRequestSchema,
  BattleSearchFilters: BattleSearchFiltersSchema,
  BattleAnalytics: BattleAnalyticsSchema,
  LeaderboardEntry: LeaderboardEntrySchema,
};
