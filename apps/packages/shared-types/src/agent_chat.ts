import { z } from 'zod';

/**
 * Direct 1:1 user<->agent chat, persisted separately from `discussions`. A
 * discussion is orchestrated — a background loop advances turns and can trigger
 * participants on its own — which is wrong for a chat driven solely by the user.
 */
export const AgentChatRoleSchema = z.enum(['user', 'assistant']);
export type AgentChatRole = z.infer<typeof AgentChatRoleSchema>;

/**
 * Tracked on the USER row: it records whether the assistant reply for that turn
 * has been produced. `processing` is claimed under a lease so a retry (or a second
 * navratna-core machine) cannot start a duplicate generation.
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
  agentId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type AgentChatConversation = z.infer<typeof AgentChatConversationSchema>;

export const AgentChatMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  organizationId: z.string().uuid(),
  clientTurnId: z.string().uuid(),
  role: AgentChatRoleSchema,
  content: z.string(),
  generationStatus: AgentChatGenerationStatusSchema.nullable().optional(),
  replyToMessageId: z.string().uuid().nullable().optional(),
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
