import { Elysia } from 'elysia';
import { withNginxAuth, getNginxUser, t } from '@uaip/middleware';
import { DiscussionStatus, TurnStrategy } from '@uaip/types';
import type { DiscussionSearchFilters } from '@uaip/types';
import { DiscussionService } from '@uaip/shared-services/discussion';
import {
  count,
  discussionMessages,
  discussionParticipants,
  discussions,
  eq,
  getIntelligenceDb,
} from '@uaip/shared-services';
import { DiscussionOrchestrationService } from '../services/discussion_orchestration_service.js';
import { participantGuard } from '../middleware/participant_guard.js';
import { logger, isRecord } from '@uaip/utils';

const normalizeRole = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim().toLowerCase() : null;

const stripHtmlTags = (input: string): string => input.replace(/<[^>]*>/g, '').trim();

const sanitizeMessageContentOnRead = (message: unknown): unknown => {
  if (!isRecord(message) || typeof message.content !== 'string') {
    return message;
  }

  return {
    ...message,
    content: stripHtmlTags(message.content),
  };
};

type ScopedDiscussionSearchFilters = DiscussionSearchFilters & {
  participantUserId?: string;
};

const isDiscussionModeratorRole = (role: string): boolean => {
  const normalized = role.trim().toLowerCase();
  return normalized === 'admin' || normalized === 'moderator';
};

const buildScopedDiscussionFilters = (
  rawFilters: Record<string, unknown>,
  user: ReturnType<typeof getNginxUser>
): ScopedDiscussionSearchFilters => {
  const filters: ScopedDiscussionSearchFilters = {
    ...rawFilters,
    organizationId: user.organizationId,
  };

  if (!isDiscussionModeratorRole(user.role)) {
    filters.createdBy = [user.id];
    filters.participantUserId = user.id;
  }

  return filters;
};

export function registerDiscussionRoutes(
  discussionService: DiscussionService,
  orchestrationService: DiscussionOrchestrationService
) {
  return new Elysia().group('/api/v1/discussions', (group) => {
    return withNginxAuth(group)
      .get(
        '/',
        async (ctx) => {
          try {
            const { limit = '20', offset = '0', ...filters } = ctx.query;
            const user = getNginxUser(ctx);
            const result = await discussionService.searchDiscussions(
              buildScopedDiscussionFilters(filters, user),
              parseInt(limit, 10),
              parseInt(offset, 10)
            );
            return { success: true, data: result.discussions, total: result.total };
          } catch (error) {
            logger.error('Failed to list discussions', { error });
            ctx.set.status = 500;
            return { success: false, error: 'Failed to list discussions' };
          }
        },
        {
          query: t.Object(
            { limit: t.Optional(t.String()), offset: t.Optional(t.String()) },
            { additionalProperties: true }
          ),
          response: {
            200: t.Object({
              success: t.Literal(true),
              data: t.Optional(t.Array(t.Any())),
              total: t.Optional(t.Number()),
            }),
            500: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .post(
        '/',
        async (ctx) => {
          try {
            const body = isRecord(ctx.body) ? ctx.body : {};
            const { id: userId, organizationId } = getNginxUser(ctx);
            const discussion = await discussionService.createDiscussion({
              ...body,
              createdBy: userId,
              organizationId,
            });
            ctx.set.status = 201;
            return { success: true, data: discussion };
          } catch (error) {
            logger.error('Failed to create discussion', { error });
            ctx.set.status = 400;
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to create discussion',
            };
          }
        },
        {
          body: t.Object(
            {
              title: t.String(),
              topic: t.Optional(t.String()),
              description: t.Optional(t.String()),
              initialParticipants: t.Optional(
                t.Array(
                  t.Object({
                    agentId: t.String(),
                    role: t.Optional(t.String()),
                  })
                )
              ),
              settings: t.Optional(t.Record(t.String(), t.Unknown())),
              turnStrategy: t.Optional(t.Record(t.String(), t.Unknown())),
            },
            { additionalProperties: true }
          ),
          response: {
            201: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .get(
        '/search',
        async (ctx) => {
          try {
            const { limit = '20', offset = '0', ...filters } = ctx.query;
            const user = getNginxUser(ctx);
            const result = await discussionService.searchDiscussions(
              buildScopedDiscussionFilters(filters, user),
              parseInt(limit, 10),
              parseInt(offset, 10)
            );
            return { success: true, data: result.discussions, total: result.total };
          } catch (error) {
            logger.error('Failed to search discussions', { error });
            ctx.set.status = 500;
            return { success: false, error: 'Failed to search discussions' };
          }
        },
        {
          query: t.Object(
            { limit: t.Optional(t.String()), offset: t.Optional(t.String()) },
            { additionalProperties: true }
          ),
          response: {
            200: t.Object({
              success: t.Literal(true),
              data: t.Optional(t.Array(t.Any())),
              total: t.Optional(t.Number()),
            }),
            500: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .get(
        '/:id',
        async (ctx) => {
          try {
            const guardFailure = await participantGuard(ctx);
            if (guardFailure) {
              return guardFailure;
            }

            const discussion = await discussionService.getDiscussion(ctx.params.id);
            if (!discussion) {
              ctx.set.status = 404;
              return { success: false, error: 'Discussion not found' };
            }
            return { success: true, data: discussion };
          } catch (error) {
            logger.error('Failed to get discussion', { error, id: ctx.params.id });
            ctx.set.status = 500;
            return { success: false, error: 'Failed to get discussion' };
          }
        },
        {
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            404: t.Object({ success: t.Literal(false), error: t.String() }),
            500: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .get(
        '/:id/summary',
        async (ctx) => {
          try {
            const guardFailure = await participantGuard(ctx);
            if (guardFailure) {
              return guardFailure;
            }

            const db = getIntelligenceDb();
            const [discussionRow] = await db
              .select({
                id: discussions.id,
                title: discussions.title,
                status: discussions.status,
                state: discussions.state,
                startedAt: discussions.startedAt,
                endedAt: discussions.endedAt,
              })
              .from(discussions)
              .where(eq(discussions.id, ctx.params.id))
              .limit(1);

            if (!discussionRow) {
              ctx.set.status = 404;
              return { success: false, error: 'Discussion not found' };
            }

            const [messageCountRow] = await db
              .select({ total: count() })
              .from(discussionMessages)
              .where(eq(discussionMessages.discussionId, ctx.params.id));

            const participantRows = await db
              .select({
                userId: discussionParticipants.userId,
                participantId: discussionParticipants.id,
              })
              .from(discussionParticipants)
              .where(eq(discussionParticipants.discussionId, ctx.params.id));

            const participants = Array.from(
              new Set(
                participantRows
                  .map((row) => row.userId ?? row.participantId)
                  .filter((id): id is string => typeof id === 'string' && id.length > 0)
              )
            );

            const activeHuddleRows = await db
              .select({ status: discussions.status })
              .from(discussions)
              .where(eq(discussions.parentDiscussionId, ctx.params.id));

            const activeHuddles = activeHuddleRows.filter(
              (row) => row.status === DiscussionStatus.ACTIVE
            ).length;

            const currentTurn =
              isRecord(discussionRow.state) && isRecord(discussionRow.state.currentTurn)
                ? discussionRow.state.currentTurn
                : null;

            return {
              success: true,
              data: {
                id: discussionRow.id,
                title: discussionRow.title,
                status: discussionRow.status,
                participants,
                currentTurn,
                messageCount: messageCountRow?.total ?? 0,
                startedAt: discussionRow.startedAt,
                endedAt: discussionRow.endedAt,
                activeHuddles,
              },
            };
          } catch (error) {
            logger.error('Failed to get discussion summary', { error, id: ctx.params.id });
            ctx.set.status = 500;
            return { success: false, error: 'Failed to get discussion summary' };
          }
        },
        {
          response: {
            200: t.Object({
              success: t.Literal(true),
              data: t.Object({
                id: t.String(),
                title: t.Any(),
                status: t.Any(),
                participants: t.Array(t.String()),
                currentTurn: t.Any(),
                messageCount: t.Number(),
                startedAt: t.Any(),
                endedAt: t.Any(),
                activeHuddles: t.Number(),
              }),
            }),
            404: t.Object({ success: t.Literal(false), error: t.String() }),
            500: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .put(
        '/:id',
        async (ctx) => {
          try {
            const user = getNginxUser(ctx);
            const result = await orchestrationService.updateDiscussion(
              ctx.params.id,
              ctx.body as Record<string, unknown>,
              user.id
            );
            if (!result.success) {
              ctx.set.status = 400;
              return { success: false, error: result.error ?? 'Failed to update discussion' };
            }
            return { success: true, data: result.data };
          } catch (error) {
            logger.error('Failed to update discussion', { error, id: ctx.params.id });
            ctx.set.status = 400;
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to update discussion',
            };
          }
        },
        {
          body: t.Object(
            {
              title: t.Optional(t.String()),
              description: t.Optional(t.String()),
              topic: t.Optional(t.String()),
              status: t.Optional(t.String()),
              settings: t.Optional(t.Record(t.String(), t.Unknown())),
              turnStrategy: t.Optional(t.Record(t.String(), t.Unknown())),
            },
            { additionalProperties: true }
          ),
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .post(
        '/:id/start',
        async (ctx) => {
          try {
            // @ts-expect-error -- Elysia withNginxAuth injects user context that TypeScript cannot infer through nested groups
            const startedBy: string = ctx.user.id;
            const result = await orchestrationService.startDiscussion(ctx.params.id, startedBy);
            if (!result.success) {
              ctx.set.status = 400;
              return { success: false, error: result.error || 'Failed to start discussion' };
            }
            return { success: true, data: result.data };
          } catch (error) {
            logger.error('Failed to start discussion', { error, id: ctx.params.id });
            ctx.set.status = 400;
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to start discussion',
            };
          }
        },
        {
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .post(
        '/:id/end',
        async (ctx) => {
          try {
            // @ts-expect-error -- Elysia withNginxAuth injects user context that TypeScript cannot infer through nested groups
            const endedBy: string = ctx.user.id;
            const body: { reason?: string } | undefined = ctx.body;
            const result = await orchestrationService.stopDiscussion(
              ctx.params.id,
              endedBy,
              body?.reason
            );
            if (!result.success) {
              ctx.set.status = 400;
              return { success: false, error: result.error || 'Failed to end discussion' };
            }
            return { success: true, data: result.data };
          } catch (error) {
            logger.error('Failed to end discussion', { error, id: ctx.params.id });
            ctx.set.status = 400;
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to end discussion',
            };
          }
        },
        {
          body: t.Object({ reason: t.Optional(t.String()) }),
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      // DELETE archives rather than destroys: discussion_messages and
      // discussion_participants cascade on delete, so removing the row would take
      // the whole transcript with it. The frontend has always called this route
      // (discussionsAPI.delete) and always got a 404 — it was never registered.
      .delete(
        '/:id',
        async (ctx) => {
          try {
            const guardFailure = await participantGuard(ctx);
            if (guardFailure) {
              return guardFailure;
            }

            const user = getNginxUser(ctx);
            const result = await orchestrationService.archiveDiscussion(ctx.params.id, user.id);
            if (!result.success) {
              ctx.set.status = result.error === 'Discussion not found' ? 404 : 400;
              return { success: false, error: result.error ?? 'Failed to delete discussion' };
            }
            return { success: true, data: result.data };
          } catch (error) {
            logger.error('Failed to delete discussion', { error, id: ctx.params.id });
            ctx.set.status = 500;
            return { success: false, error: 'Failed to delete discussion' };
          }
        },
        {
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
            401: t.Object({ success: t.Literal(false), error: t.String() }),
            403: t.Object({ success: t.Literal(false), error: t.String() }),
            404: t.Object({ success: t.Literal(false), error: t.String() }),
            500: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      // Read side of the participant list. POST /:id/participants existed from the
      // start but the GET never did, so a client that added a participant had no
      // way to read the roster back and got a bare 404.
      .get(
        '/:id/participants',
        async (ctx) => {
          try {
            const guardFailure = await participantGuard(ctx);
            if (guardFailure) {
              return guardFailure;
            }

            const db = getIntelligenceDb();
            const rows = await db
              .select({
                id: discussionParticipants.id,
                discussionId: discussionParticipants.discussionId,
                agentId: discussionParticipants.agentId,
                userId: discussionParticipants.userId,
                personaId: discussionParticipants.personaId,
                role: discussionParticipants.role,
                participantType: discussionParticipants.participantType,
                joinedAt: discussionParticipants.joinedAt,
                leftAt: discussionParticipants.leftAt,
                isActive: discussionParticipants.isActive,
                turnCount: discussionParticipants.turnCount,
                messageCount: discussionParticipants.messageCount,
              })
              .from(discussionParticipants)
              .where(eq(discussionParticipants.discussionId, ctx.params.id));

            // Removed participants are kept as rows (isActive=false) for message
            // attribution, so they are excluded unless explicitly requested.
            const includeInactive = ctx.query.includeInactive === 'true';
            const participants = includeInactive ? rows : rows.filter((row) => row.isActive);

            return { success: true, data: participants };
          } catch (error) {
            logger.error('Failed to list discussion participants', { error, id: ctx.params.id });
            ctx.set.status = 500;
            return { success: false, error: 'Failed to list discussion participants' };
          }
        },
        {
          query: t.Object({ includeInactive: t.Optional(t.String()) }),
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Array(t.Any()) }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
            401: t.Object({ success: t.Literal(false), error: t.String() }),
            403: t.Object({ success: t.Literal(false), error: t.String() }),
            404: t.Object({ success: t.Literal(false), error: t.String() }),
            500: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .post(
        '/:id/participants',
        async (ctx) => {
          try {
            // @ts-expect-error -- Elysia withNginxAuth injects user context that TypeScript cannot infer through nested groups
            const addedBy: string = ctx.user.id;
            const result = await orchestrationService.addParticipant(
              ctx.params.id,
              ctx.body,
              addedBy
            );
            if (!result.success) {
              ctx.set.status = 400;
              return { success: false, error: result.error ?? 'Failed to add participant' };
            }
            ctx.set.status = 201;
            return { success: true, data: result.data };
          } catch (error) {
            logger.error('Failed to add participant', { error, id: ctx.params.id });
            ctx.set.status = 400;
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to add participant',
            };
          }
        },
        {
          body: t.Object({
            agentId: t.String(),
            role: t.Optional(t.String()),
          }),
          response: {
            201: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .delete(
        '/:id/participants/:pid',
        async (ctx) => {
          try {
            // @ts-expect-error -- Elysia withNginxAuth injects user context that TypeScript cannot infer through nested groups
            const removedBy: string = ctx.user.id;
            const result = await orchestrationService.removeParticipant(
              ctx.params.id,
              ctx.params.pid,
              removedBy
            );
            if (!result.success) {
              ctx.set.status = 400;
              return { success: false, error: result.error ?? 'Failed to remove participant' };
            }
            return { success: true, message: 'Participant removed' };
          } catch (error) {
            logger.error('Failed to remove participant', { error, id: ctx.params.id });
            ctx.set.status = 400;
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to remove participant',
            };
          }
        },
        {
          response: {
            200: t.Object({ success: t.Literal(true), message: t.String() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .post(
        '/:id/participants/:pid/messages',
        async (ctx) => {
          try {
            // @ts-expect-error -- Elysia body shape validated by runtime schema; TypeScript cannot infer through nested groups
            const body: {
              content: string;
              messageType?: string;
              metadata?: Record<string, unknown>;
            } = ctx.body;
            // SECURITY: sendMessage does not bind participant->user, so :pid
            // must be proven to be the caller's or anyone can post as anyone.
            const author = getNginxUser(ctx);
            const callerParticipant = await orchestrationService.getParticipantByUserId(
              ctx.params.id,
              author.id
            );
            if (!callerParticipant || callerParticipant.id !== ctx.params.pid) {
              ctx.set.status = 403;
              return { success: false, error: 'Cannot send a message as another participant' };
            }

            const sanitizedContent = stripHtmlTags(body.content);
            const result = await orchestrationService.sendMessage(
              ctx.params.id,
              ctx.params.pid,
              sanitizedContent,
              body.messageType || 'message',
              body.metadata
            );
            if (!result.success) {
              ctx.set.status = 400;
              return { success: false, error: result.error };
            }
            ctx.set.status = 201;
            return { success: true, data: result };
          } catch (error) {
            logger.error('Failed to send message', { error, id: ctx.params.id });
            ctx.set.status = 400;
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to send message',
            };
          }
        },
        {
          body: t.Object({
            content: t.String(),
            messageType: t.Optional(t.String()),
            metadata: t.Optional(t.Record(t.String(), t.Unknown())),
          }),
          response: {
            201: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: t.Object({ success: t.Literal(false), error: t.Optional(t.Any()) }),
          },
        }
      )

      .get(
        '/:id/messages',
        async (ctx) => {
          try {
            const guardFailure = await participantGuard(ctx);
            if (guardFailure) {
              return guardFailure;
            }

            const { limit = '50', offset = '0', order } = ctx.query;
            const messages = await discussionService.getDiscussionMessages(ctx.params.id, {
              limit: parseInt(limit, 10),
              offset: parseInt(offset, 10),
              ...(order === 'desc' ? { order: 'desc' as const } : {}),
            });
            return {
              success: true,
              data: messages.map((message) => sanitizeMessageContentOnRead(message)),
            };
          } catch (error) {
            logger.error('Failed to get messages', { error, id: ctx.params.id });
            ctx.set.status = 500;
            return { success: false, error: 'Failed to get messages' };
          }
        },
        {
          query: t.Object({
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
            order: t.Optional(t.String()),
          }),
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Array(t.Any()) }),
            500: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .post(
        '/:id/advance-turn',
        async (ctx) => {
          try {
            // @ts-expect-error -- Elysia withNginxAuth injects user context that TypeScript cannot infer through nested groups
            const role = normalizeRole(ctx.user?.role) ?? normalizeRole(ctx.headers['x-user-role']);
            if (role !== 'admin' && role !== 'moderator') {
              ctx.set.status = 403;
              return { success: false, error: 'Only moderators can force-advance turns' };
            }

            // @ts-expect-error -- Elysia withNginxAuth injects user context that TypeScript cannot infer through nested groups
            const forcedBy: string = ctx.user.id;
            const result = await orchestrationService.forceAdvanceTurn(ctx.params.id, forcedBy);
            if (!result.success) {
              ctx.set.status = 400;
              return { success: false, error: result.error ?? 'Failed to advance turn' };
            }
            return { success: true, message: 'Turn advanced' };
          } catch (error) {
            logger.error('Failed to advance turn', { error, id: ctx.params.id });
            ctx.set.status = 400;
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to advance turn',
            };
          }
        },
        {
          response: {
            200: t.Object({ success: t.Literal(true), message: t.String() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
            403: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .get(
        '/:id/analytics',
        async (ctx) => {
          try {
            const guardFailure = await participantGuard(ctx);
            if (guardFailure) {
              return guardFailure;
            }

            const analytics = await discussionService.getDiscussionAnalytics(ctx.params.id);
            return { success: true, data: analytics };
          } catch (error) {
            logger.error('Failed to get discussion analytics', { error, id: ctx.params.id });
            ctx.set.status = 500;
            return { success: false, error: 'Failed to get discussion analytics' };
          }
        },
        {
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            500: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .post(
        '/:id/turns/request',
        async (ctx) => {
          try {
            // SECURITY: never from the body — requestTurn only checks the id
            // exists, so a body id lets anyone act as another participant.
            const user = getNginxUser(ctx);
            const participant = await orchestrationService.getParticipantByUserId(
              ctx.params.id,
              user.id
            );
            if (!participant) {
              ctx.set.status = 403;
              return { success: false, error: 'You are not a participant in this discussion' };
            }

            const result = await orchestrationService.requestTurn(ctx.params.id, participant.id);
            if (!result.success) {
              ctx.set.status = 400;
              return { success: false, error: result.error ?? 'Failed to request turn' };
            }
            return { success: true, data: result.data };
          } catch (error) {
            logger.error('Failed to request turn', { error, id: ctx.params.id });
            ctx.set.status = 400;
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to request turn',
            };
          }
        },
        {
          body: t.Object({
            participantId: t.Optional(t.String()),
            reason: t.Optional(t.String()),
          }),
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .post(
        '/:id/huddle',
        async (ctx) => {
          try {
            const body:
              | {
                  initiatorId?: string;
                  participants?: string[];
                  topic?: string;
                  context?: string;
                }
              | undefined = ctx.body;
            const participantIds =
              body?.participants && body.participants.length > 0
                ? body.participants
                : body?.initiatorId
                  ? [body.initiatorId]
                  : [];
            if (participantIds.length === 0) {
              ctx.set.status = 400;
              return { success: false, error: 'participants or initiatorId is required' };
            }

            // createHuddle validates membership and maps participant ids to
            // agent ids; this route only proves the caller may act here.
            const creator = getNginxUser(ctx);
            const result = await orchestrationService.createHuddle(
              ctx.params.id,
              participantIds,
              body?.topic || 'Specialist huddle',
              creator.id
            );
            ctx.set.status = 201;
            return { success: true, data: result };
          } catch (error) {
            logger.error('Failed to create huddle', { error, id: ctx.params.id });
            ctx.set.status = 400;
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to create huddle',
            };
          }
        },
        {
          body: t.Object({
            initiatorId: t.Optional(t.String()),
            participants: t.Optional(t.Array(t.String())),
            topic: t.Optional(t.String()),
            context: t.Optional(t.String()),
          }),
          response: {
            201: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .post(
        '/:id/huddles/:huddle_id/resolve',
        async (ctx) => {
          try {
            // resolveHuddle takes only the huddle id, so without this any huddle
            // could be resolved through any discussion's URL.
            const huddle = await discussionService.getDiscussion(ctx.params.huddle_id);
            if (!huddle) {
              ctx.set.status = 404;
              return { success: false, error: 'Huddle not found' };
            }
            // Column first, matching resolveHuddle — metadata is user-writable.
            const parentId =
              huddle.parentDiscussionId ??
              (typeof huddle.metadata?.parentDiscussionId === 'string'
                ? huddle.metadata.parentDiscussionId
                : undefined);
            if (parentId !== ctx.params.id) {
              ctx.set.status = 404;
              return { success: false, error: 'Huddle not found in this discussion' };
            }

            const body: { summary?: string } | undefined = ctx.body;
            const resolver = getNginxUser(ctx);
            await orchestrationService.resolveHuddle(
              ctx.params.huddle_id,
              body?.summary || '',
              resolver.id
            );
            return { success: true, message: 'Huddle resolved' };
          } catch (error) {
            logger.error('Failed to resolve huddle', { error, huddleId: ctx.params.huddle_id });
            ctx.set.status = 400;
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to resolve huddle',
            };
          }
        },
        {
          body: t.Object({ summary: t.Optional(t.String()) }),
          response: {
            200: t.Object({ success: t.Literal(true), message: t.String() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .put(
        '/:id/turn-strategy',
        async (ctx) => {
          try {
            const body = ctx.body as
              | { strategy: string; config?: Record<string, unknown> }
              | undefined;
            const strategyValue = body?.strategy;
            const validStrategies = Object.values(TurnStrategy) as string[];
            if (!strategyValue || !validStrategies.includes(strategyValue)) {
              ctx.set.status = 400;
              return {
                success: false,
                error: `Invalid turn strategy. Valid values: ${validStrategies.join(', ')}`,
              };
            }

            // Enum check above is not enough — not every enum value is implemented.
            const user = getNginxUser(ctx);
            const result = await orchestrationService.updateTurnStrategy(
              ctx.params.id,
              strategyValue as TurnStrategy,
              body?.config,
              user.id
            );

            if (!result.success) {
              ctx.set.status = 400;
              return { success: false, error: result.error ?? 'Failed to update turn strategy' };
            }

            return { success: true, data: result.data };
          } catch (error) {
            logger.error('Failed to update turn strategy', { error, id: ctx.params.id });
            ctx.set.status = 400;
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to update turn strategy',
            };
          }
        },
        {
          body: t.Object({
            strategy: t.String(),
            config: t.Optional(t.Record(t.String(), t.Unknown())),
          }),
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      )

      .patch(
        '/:id/status',
        async (ctx) => {
          try {
            const body = ctx.body as { status: string } | undefined;
            const statusValue = body?.status;
            const validStatuses = Object.values(DiscussionStatus) as string[];
            if (!statusValue || !validStatuses.includes(statusValue)) {
              ctx.set.status = 400;
              return {
                success: false,
                error: `Invalid status. Valid values: ${validStatuses.join(', ')}`,
              };
            }
            const user = getNginxUser(ctx);
            const result = await orchestrationService.changeStatus(
              ctx.params.id,
              statusValue as DiscussionStatus,
              user.id
            );
            if (!result.success) {
              ctx.set.status = 400;
              return { success: false, error: result.error ?? 'Failed to update discussion status' };
            }
            return { success: true, data: result.data };
          } catch (error) {
            logger.error('Failed to update discussion status', { error, id: ctx.params.id });
            ctx.set.status = 400;
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to update discussion status',
            };
          }
        },
        {
          body: t.Object({ status: t.String() }),
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        }
      );
  });
}
