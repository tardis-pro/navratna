import {
  and,
  discussionMessages,
  discussionParticipants,
  discussions,
  eq,
  getIntelligenceDb,
} from '@uaip/shared-services'
import { logger } from '@uaip/utils'

type UnknownRecord = Record<string, unknown>

type GuardContext = {
  params?: { id?: string }
  headers?: Record<string, string | undefined>
  user?: {
    id?: string
    role?: string
  } | null
  set: {
    status?: number
  }
}

type GuardFailure = {
  success: false
  error: string
}

const MODERATOR_ROLES = new Set(['admin', 'moderator'])

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const normalizeRole = (value: unknown): string | null => normalizeString(value)?.toLowerCase() ?? null

const extractUserFromContext = (ctx: GuardContext): { userId: string | null; role: string | null } => {
  const headerUserId = normalizeString(ctx.headers?.['x-user-id'])
  const headerRole = normalizeRole(ctx.headers?.['x-user-role'])

  const contextUserId = normalizeString(ctx.user?.id)
  const contextRole = normalizeRole(ctx.user?.role)

  return {
    userId: contextUserId ?? headerUserId,
    role: contextRole ?? headerRole,
  }
}

const discussionHasParticipant = (discussionRow: unknown, userId: string): boolean => {
  if (!isRecord(discussionRow) || !Array.isArray(discussionRow.participants)) {
    return false
  }

  return discussionRow.participants.some((participant) => {
    const participantId = normalizeString(participant)
    if (participantId === userId) {
      return true
    }

    if (!isRecord(participant)) {
      return false
    }

    const nestedUserId =
      normalizeString(participant.userId) ??
      normalizeString(participant.id) ??
      normalizeString(participant.participantId)

    return nestedUserId === userId
  })
}

export async function participantGuard(ctx: GuardContext): Promise<GuardFailure | null> {
  const discussionId = normalizeString(ctx.params?.id)
  if (!discussionId) {
    ctx.set.status = 400
    return { success: false, error: 'Discussion id is required' }
  }

  const { userId, role } = extractUserFromContext(ctx)
  if (!userId) {
    ctx.set.status = 401
    return { success: false, error: 'Authentication required' }
  }

  if (role && MODERATOR_ROLES.has(role)) {
    return null
  }

  try {
    const db = getIntelligenceDb()

    const [discussionRow] = await db
      .select()
      .from(discussions)
      .where(eq(discussions.id, discussionId))
      .limit(1)

    if (!discussionRow) {
      ctx.set.status = 404
      return { success: false, error: 'Discussion not found' }
    }

    if (discussionHasParticipant(discussionRow, userId)) {
      return null
    }

    const [messageRow] = await db
      .select({ messageId: discussionMessages.id })
      .from(discussionMessages)
      .innerJoin(discussionParticipants, eq(discussionMessages.participantId, discussionParticipants.id))
      .where(
        and(
          eq(discussionMessages.discussionId, discussionId),
          eq(discussionParticipants.userId, userId)
        )
      )
      .limit(1)

    if (messageRow) {
      return null
    }

    ctx.set.status = 403
    return { success: false, error: 'Forbidden: discussion access denied' }
  } catch (error) {
    logger.error('participantGuard failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      discussionId,
      userId,
    })
    ctx.set.status = 500
    return { success: false, error: 'Failed to validate discussion access' }
  }
}
