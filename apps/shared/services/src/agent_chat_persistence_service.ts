import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type {
  AgentChatMessage,
  AgentChatRole,
  AgentChatThreadSummary,
  AgentChatTurnState,
  AgentChatUsage,
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { getIntelligenceDb } from './database/drizzle/clients/index.js';
import {
  agentChatConversations,
  agentChatMessages,
  agentChatParticipants,
} from './database/drizzle/schemas/intelligence_schema.js';

/**
 * How long a claimed turn may stay `processing` before another attempt may take
 * it over. Bounds the window in which a machine killed mid-generation would
 * otherwise wedge the conversation permanently.
 */
const TURN_LEASE_MS = 3 * 60 * 1000;

const THREAD_LIST_LIMIT = 100;
const THREAD_TITLE_MAX_LENGTH = 60;

export interface ListThreadsParams {
  organizationId: string;
  userId: string;
  limit?: number;
}

export interface UpdateThreadParams {
  conversationId: string;
  organizationId: string;
  userId: string;
  title?: string;
  model?: string | null;
  archived?: boolean;
}

export interface ResolveConversationParams {
  organizationId: string;
  userId: string;
  agentId: string;
  /**
   * Which thread of this user's to use. Defaults to the agent id, which is what
   * the pre-thread schema effectively stored — so a client that does not send one
   * keeps resolving to its existing conversation.
   */
  threadKey?: string;
}

export interface BeginTurnParams extends ResolveConversationParams {
  clientTurnId: string;
  content: string;
}

export interface CompleteTurnParams {
  conversationId: string;
  organizationId: string;
  clientTurnId: string;
  userMessageId: string;
  processingToken: string;
  content: string;
  agentId: string;
  model?: string;
  usage?: AgentChatUsage;
  metadata?: Record<string, unknown>;
}

export interface LoadHistoryParams {
  conversationId: string;
  limit?: number;
}

export class AgentChatPersistenceService {
  /**
   * One conversation per (organization, user, threadKey), resolved with a single
   * database-enforced upsert. A plain select-then-insert would let two concurrent
   * navratna-core machines both miss and both insert; the unique index makes the
   * database pick the winner. The no-op `set` is what turns the conflict into a
   * RETURNING of the existing row rather than an error.
   */
  async resolveConversation(params: ResolveConversationParams): Promise<string> {
    const db = getIntelligenceDb();
    const threadKey = params.threadKey ?? params.agentId;

    const [conversation] = await db
      .insert(agentChatConversations)
      .values({
        organizationId: params.organizationId,
        userId: params.userId,
        agentId: params.agentId,
        threadKey,
      })
      .onConflictDoUpdate({
        target: [
          agentChatConversations.organizationId,
          agentChatConversations.userId,
          agentChatConversations.threadKey,
        ],
        set: { updatedAt: new Date() },
      })
      .returning({ id: agentChatConversations.id });

    if (!conversation) {
      throw new Error('Failed to resolve the agent chat conversation');
    }

    // Membership is what makes an agent addressable in the thread; without this
    // the very first turn would have no participant row to attribute a reply to.
    await db
      .insert(agentChatParticipants)
      .values({
        conversationId: conversation.id,
        agentId: params.agentId,
        organizationId: params.organizationId,
      })
      .onConflictDoNothing({
        target: [agentChatParticipants.conversationId, agentChatParticipants.agentId],
      });

    return conversation.id;
  }

  /**
   * Stores the user turn and claims the right to generate its reply.
   *
   * The user row is written BEFORE generation so a crash mid-call cannot lose what
   * the user typed. `clientTurnId` makes the insert idempotent, so a retry of the
   * same turn reuses the original row instead of appending a duplicate.
   */
  async beginTurn(params: BeginTurnParams): Promise<AgentChatTurnState> {
    const db = getIntelligenceDb();
    const conversationId = await this.resolveConversation(params);

    await db
      .insert(agentChatMessages)
      .values({
        conversationId,
        organizationId: params.organizationId,
        clientTurnId: params.clientTurnId,
        role: 'user',
        content: params.content,
        generationStatus: 'pending',
      })
      .onConflictDoNothing({
        // Matches the partial index predicate; without it Postgres cannot tell
        // which of the two turn indexes this conflict target refers to.
        target: [agentChatMessages.conversationId, agentChatMessages.clientTurnId],
        where: sql`${agentChatMessages.role} = 'user'`,
      });

    const [userMessage] = await db
      .select({ id: agentChatMessages.id })
      .from(agentChatMessages)
      .where(
        and(
          eq(agentChatMessages.conversationId, conversationId),
          eq(agentChatMessages.clientTurnId, params.clientTurnId),
          eq(agentChatMessages.role, 'user')
        )
      )
      .limit(1);

    if (!userMessage) {
      throw new Error('Failed to persist the agent chat user message');
    }

    const processingToken = crypto.randomUUID();
    const staleBefore = new Date(Date.now() - TURN_LEASE_MS);

    const [claimed] = await db
      .update(agentChatMessages)
      .set({
        generationStatus: 'processing',
        processingToken,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(agentChatMessages.id, userMessage.id),
          or(
            inArray(agentChatMessages.generationStatus, ['pending', 'failed']),
            and(
              eq(agentChatMessages.generationStatus, 'processing'),
              lt(agentChatMessages.updatedAt, staleBefore)
            )
          )
        )
      )
      .returning({ id: agentChatMessages.id });

    if (claimed) {
      return {
        state: 'claimed',
        claim: { conversationId, userMessageId: userMessage.id, processingToken },
      };
    }

    // Lost the claim: either the reply already exists (replay it rather than pay
    // for a second generation) or another attempt currently holds the lease.
    const [existingReply] = await db
      .select({ id: agentChatMessages.id, content: agentChatMessages.content })
      .from(agentChatMessages)
      .where(
        and(
          eq(agentChatMessages.conversationId, conversationId),
          eq(agentChatMessages.clientTurnId, params.clientTurnId),
          eq(agentChatMessages.role, 'assistant')
        )
      )
      .limit(1);

    if (existingReply) {
      return {
        state: 'completed',
        conversationId,
        content: existingReply.content,
        assistantMessageId: existingReply.id,
      };
    }

    return { state: 'processing', conversationId };
  }

  /**
   * Writes the assistant turn, but only if this caller still holds the lease. The
   * conditional status flip and the insert share one transaction so a turn can
   * never end up with two assistant rows.
   */
  async completeTurn(params: CompleteTurnParams): Promise<string | null> {
    const db = getIntelligenceDb();

    return db.transaction(async (tx) => {
      const [released] = await tx
        .update(agentChatMessages)
        .set({ generationStatus: 'completed', processingToken: null, updatedAt: new Date() })
        .where(
          and(
            eq(agentChatMessages.id, params.userMessageId),
            eq(agentChatMessages.processingToken, params.processingToken)
          )
        )
        .returning({ id: agentChatMessages.id });

      if (!released) return null;

      const [assistant] = await tx
        .insert(agentChatMessages)
        .values({
          conversationId: params.conversationId,
          organizationId: params.organizationId,
          clientTurnId: params.clientTurnId,
          role: 'assistant',
          content: params.content,
          replyToMessageId: params.userMessageId,
          agentId: params.agentId,
          model: params.model,
          promptTokens: params.usage?.promptTokens ?? null,
          completionTokens: params.usage?.completionTokens ?? null,
          totalTokens: params.usage?.totalTokens ?? null,
          costUsd: params.usage?.costUsd ?? null,
          metadata: params.metadata ?? {},
        })
        .returning({ id: agentChatMessages.id });

      await tx
        .update(agentChatConversations)
        .set({ updatedAt: new Date() })
        .where(eq(agentChatConversations.id, params.conversationId));

      return assistant?.id ?? null;
    });
  }

  /**
   * Marks the turn failed so it can be retried. The user message is deliberately
   * kept — deleting it would erase what the user typed.
   */
  async failTurn(userMessageId: string, processingToken: string): Promise<void> {
    const db = getIntelligenceDb();
    try {
      await db
        .update(agentChatMessages)
        .set({ generationStatus: 'failed', processingToken: null, updatedAt: new Date() })
        .where(
          and(
            eq(agentChatMessages.id, userMessageId),
            eq(agentChatMessages.processingToken, processingToken)
          )
        );
    } catch (error) {
      logger.error('Failed to release a failed agent chat turn', {
        userMessageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Oldest-first transcript, since that is the order the model must read. The
   * limit takes the MOST RECENT window via a descending subquery — a plain
   * ascending limit would return the start of the conversation forever.
   */
  async loadHistory(params: LoadHistoryParams): Promise<AgentChatMessage[]> {
    const db = getIntelligenceDb();
    const limit = params.limit ?? 50;

    const recent = db
      .select()
      .from(agentChatMessages)
      .where(eq(agentChatMessages.conversationId, params.conversationId))
      .orderBy(sql`${agentChatMessages.createdAt} DESC, ${agentChatMessages.id} DESC`)
      .limit(limit)
      .as('recent');

    const rows = await db
      .select()
      .from(recent)
      .orderBy(asc(recent.createdAt), asc(recent.id));

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      organizationId: row.organizationId,
      clientTurnId: row.clientTurnId,
      role: row.role as AgentChatRole,
      content: row.content,
      generationStatus: row.generationStatus,
      replyToMessageId: row.replyToMessageId,
      agentId: row.agentId,
      model: row.model,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalTokens: row.totalTokens,
      costUsd: row.costUsd,
      metadata: row.metadata ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * Looks up the conversation by OWNER identity rather than by a caller-supplied
   * id, so a reader can only ever reach their own transcript. Returns null when
   * the user has no such thread yet.
   */
  async findOwnedConversation(params: ResolveConversationParams): Promise<string | null> {
    const db = getIntelligenceDb();
    const threadKey = params.threadKey ?? params.agentId;

    const [row] = await db
      .select({ id: agentChatConversations.id })
      .from(agentChatConversations)
      .where(
        and(
          eq(agentChatConversations.organizationId, params.organizationId),
          eq(agentChatConversations.userId, params.userId),
          eq(agentChatConversations.threadKey, threadKey)
        )
      )
      .limit(1);

    return row?.id ?? null;
  }

  /**
   * Every thread the user owns, newest activity first. Archived threads are
   * excluded — archiving is how a thread leaves the list without losing history.
   */
  async listThreads(params: ListThreadsParams): Promise<AgentChatThreadSummary[]> {
    const db = getIntelligenceDb();

    const rows = await db
      .select({
        id: agentChatConversations.id,
        threadKey: agentChatConversations.threadKey,
        agentId: agentChatConversations.agentId,
        title: agentChatConversations.title,
        model: agentChatConversations.model,
        createdAt: agentChatConversations.createdAt,
        updatedAt: agentChatConversations.updatedAt,
      })
      .from(agentChatConversations)
      .where(
        and(
          eq(agentChatConversations.organizationId, params.organizationId),
          eq(agentChatConversations.userId, params.userId),
          isNull(agentChatConversations.archivedAt)
        )
      )
      .orderBy(sql`${agentChatConversations.updatedAt} DESC`)
      .limit(params.limit ?? THREAD_LIST_LIMIT);

    if (rows.length === 0) return [];

    const participantRows = await db
      .select({
        conversationId: agentChatParticipants.conversationId,
        agentId: agentChatParticipants.agentId,
      })
      .from(agentChatParticipants)
      .where(
        inArray(
          agentChatParticipants.conversationId,
          rows.map((row) => row.id)
        )
      );

    const byConversation = new Map<string, string[]>();
    for (const row of participantRows) {
      const list = byConversation.get(row.conversationId) ?? [];
      list.push(row.agentId);
      byConversation.set(row.conversationId, list);
    }

    return rows.map((row) => ({
      id: row.id,
      threadKey: row.threadKey,
      agentId: row.agentId,
      title: row.title,
      model: row.model,
      agentIds: byConversation.get(row.id) ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * Scoped by owner on the WHERE rather than by id alone, so a caller cannot
   * rename, archive or re-model a thread that is not theirs. Returns false when
   * nothing matched, which the route reports as 404.
   */
  async updateOwnedThread(params: UpdateThreadParams): Promise<boolean> {
    const db = getIntelligenceDb();

    const patch: Partial<typeof agentChatConversations.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (params.title !== undefined) patch.title = params.title;
    if (params.model !== undefined) patch.model = params.model;
    if (params.archived !== undefined) patch.archivedAt = params.archived ? new Date() : null;

    const updated = await db
      .update(agentChatConversations)
      .set(patch)
      .where(
        and(
          eq(agentChatConversations.id, params.conversationId),
          eq(agentChatConversations.organizationId, params.organizationId),
          eq(agentChatConversations.userId, params.userId)
        )
      )
      .returning({ id: agentChatConversations.id });

    return updated.length > 0;
  }

  /**
   * Derives a title from the opening message so a thread is identifiable without
   * the user naming it. Best-effort by design: it must never fail a turn, and it
   * only ever fills an EMPTY title so a user's own name is never overwritten.
   */
  async ensureThreadTitle(conversationId: string, firstMessage: string): Promise<void> {
    const trimmed = firstMessage.trim().replace(/\s+/g, ' ');
    if (trimmed.length === 0) return;

    const title =
      trimmed.length > THREAD_TITLE_MAX_LENGTH
        ? `${trimmed.slice(0, THREAD_TITLE_MAX_LENGTH - 1)}…`
        : trimmed;

    try {
      const db = getIntelligenceDb();
      await db
        .update(agentChatConversations)
        .set({ title })
        .where(
          and(
            eq(agentChatConversations.id, conversationId),
            isNull(agentChatConversations.title)
          )
        );
    } catch (error) {
      logger.warn('Failed to derive an agent chat thread title', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const agentChatPersistenceService = new AgentChatPersistenceService();
