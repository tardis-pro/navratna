import { z } from 'zod';

/**
 * User-driven agent chat, persisted separately from `discussions`. A discussion is
 * orchestrated — a background loop advances turns and can trigger participants on
 * its own — which is wrong for a chat that must only ever speak when the user does.
 */
export const AgentChatRoleSchema = z.enum(['user', 'assistant']);
export type AgentChatRole = z.infer<typeof AgentChatRoleSchema>;

/**
 * Records whether a reply for the turn has been produced. Claimed under a lease so
 * a retry (or a second navratna-core machine) cannot start a duplicate generation.
 */
export const AgentChatGenerationStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
]);
export type AgentChatGenerationStatus = z.infer<typeof AgentChatGenerationStatusSchema>;

export const AgentChatConversationSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  /**
   * The agent that answers a turn mentioning nobody. Null once a thread is a
   * group; membership itself lives in agent_chat_participants.
   */
  agentId: z.string().uuid().nullable().optional(),
  /** Client-generated thread identity, unique per (organization, user). */
  threadKey: z.string().uuid(),
  title: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  userLlmProviderId: z.string().uuid().nullable().optional(),
  archivedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type AgentChatConversation = z.infer<typeof AgentChatConversationSchema>;

export const AgentChatThreadSummarySchema = z.object({
  id: z.string().uuid(),
  threadKey: z.string().uuid(),
  agentId: z.string().uuid().nullable().optional(),
  title: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  /** Every agent in the thread, not just the primary — one entry for a 1:1 chat. */
  agentIds: z.array(z.string().uuid()),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type AgentChatThreadSummary = z.infer<typeof AgentChatThreadSummarySchema>;

/** Per-turn provider accounting. Null when a provider reports no usage. */
export const AgentChatUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative().nullable().optional(),
  completionTokens: z.number().int().nonnegative().nullable().optional(),
  totalTokens: z.number().int().nonnegative().nullable().optional(),
  costUsd: z.number().nonnegative().nullable().optional(),
});
export type AgentChatUsage = z.infer<typeof AgentChatUsageSchema>;

export const AgentChatMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  organizationId: z.string().uuid(),
  clientTurnId: z.string().uuid(),
  role: AgentChatRoleSchema,
  content: z.string(),
  generationStatus: AgentChatGenerationStatusSchema.nullable().optional(),
  replyToMessageId: z.string().uuid().nullable().optional(),
  /** Which agent produced an assistant message. Null on user messages. */
  agentId: z.string().uuid().nullable().optional(),
  model: z.string().nullable().optional(),
  promptTokens: z.number().int().nullable().optional(),
  completionTokens: z.number().int().nullable().optional(),
  totalTokens: z.number().int().nullable().optional(),
  costUsd: z.number().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type AgentChatMessage = z.infer<typeof AgentChatMessageSchema>;

export interface AgentChatTurnClaim {
  conversationId: string;
  userMessageId: string;
  processingToken: string;
}

/**
 * Returned when the turn could not be claimed. `completed` carries the reply that
 * a previous attempt already stored, so a retry replays it instead of paying for
 * a second generation; `processing` means another attempt holds the lease.
 */
export type AgentChatTurnState =
  | { state: 'claimed'; claim: AgentChatTurnClaim }
  | { state: 'completed'; conversationId: string; content: string; assistantMessageId: string }
  | { state: 'processing'; conversationId: string };
