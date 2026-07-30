import {
  and,
  discussionParticipants,
  discussions,
  eq,
  getIntelligenceDb,
} from '@uaip/shared-services'
import type { GuardContext, GuardFailure } from '@uaip/types'
import { logger } from '@uaip/utils'

const MODERATOR_ROLES = new Set(['admin', 'moderator'])

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const normalizeRole = (value: unknown): string | null => normalizeString(value)?.toLowerCase() ?? null

const extractUserFromContext = (
  ctx: GuardContext
): { userId: string | null; role: string | null; organizationId: string | null } => {
  const headerUserId = normalizeString(ctx.headers?.['x-user-id'])
  const headerRole = normalizeRole(ctx.headers?.['x-user-role'])
  const headerOrgId = normalizeString(ctx.headers?.['x-organization-id'])

  const contextUserId = normalizeString(ctx.user?.id)
  const contextRole = normalizeRole(ctx.user?.role)
  const contextOrgId = normalizeString(ctx.user?.organizationId)

  return {
    userId: contextUserId ?? headerUserId,
    role: contextRole ?? headerRole,
    organizationId: contextOrgId ?? headerOrgId,
  }
}



export async function participantGuard(ctx: GuardContext): Promise<GuardFailure | null> {
  const discussionId = normalizeString(ctx.params?.id)
  if (!discussionId) {
    ctx.set.status = 400
    return { success: false, error: 'Discussion id is required' }
  }

  const { userId, role, organizationId } = extractUserFromContext(ctx)
  if (!userId) {
    ctx.set.status = 401
    return { success: false, error: 'Authentication required' }
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

    // SECURITY: before the role bypass — else a moderator crosses tenants.
    const discussionOrgId = normalizeString(discussionRow.organizationId)
    if (discussionOrgId && organizationId !== discussionOrgId) {
      ctx.set.status = 403
      return { success: false, error: 'Forbidden: discussion access denied' }
    }

    if (role && MODERATOR_ROLES.has(role)) {
      return null
    }

    if (normalizeString(discussionRow.createdBy) === userId) {
      return null
    }

    // discussions has NO participants column; isActive drops removed members.
    const [participantRow] = await db
      .select({ participantId: discussionParticipants.id })
      .from(discussionParticipants)
      .where(
        and(
          eq(discussionParticipants.discussionId, discussionId),
          eq(discussionParticipants.userId, userId),
          eq(discussionParticipants.isActive, true)
        )
      )
      .limit(1)

    if (participantRow) {
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
