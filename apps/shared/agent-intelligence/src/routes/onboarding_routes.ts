import { Elysia, t } from 'elysia'
import { withNginxAuth, getNginxUser } from '@uaip/middleware'
import {
  ADMIN_ORG_ID,
  AgentChatPersistenceService,
  isOfferableToOrg,
  ONBOARDING_GUIDE_AGENT_ID,
  ONBOARDING_SLOTS,
  OnboardingInterviewRepository,
  OnboardingService,
  UserAgentAssignmentRepository,
} from '@uaip/shared-services'
import type {
  AgentCandidate,
  InterviewSnapshot,
  OnboardingSlot,
} from '@uaip/shared-services'
import { getIntelligenceDb, and, eq, ne, or } from '@uaip/shared-services/drizzle/clients'
import { agents } from '@uaip/shared-services/drizzle/intelligence'
import { logger, isRecord } from '@uaip/utils'

/**
 * HTTP surface for the conversational onboarding interview.
 *
 * Every handler resolves the caller from the authenticated context, never from
 * the body or query — an interview is the user's own or it does not exist.
 * The agent roster is loaded here rather than in the service so the service
 * stays free of intelligence-plane access.
 */

interface ClientSlotView {
  status: string
  value: string | null
  confidence: number | null
  revision: number
}

interface ClientInterviewView {
  id: string
  status: string
  currentObjective: string | null
  turnCount: number
  stateVersion: number
  guideAgentId: string
}

interface ClientMessageView {
  id: string
  role: string
  content: string
  createdAt: string
}

interface TranscriptMessage {
  id: string
  role: string
  content: string
  createdAt?: Date | string
}

interface TurnRequestBody {
  message: string
  clientTurnId: string
  expectedStateVersion: number
}

interface SlotRequestBody {
  value: string | null
  status: 'answered' | 'declined'
}

function readTurnBody(body: unknown): TurnRequestBody | null {
  if (!isRecord(body)) return null
  const { message, clientTurnId, expectedStateVersion } = body
  if (typeof message !== 'string' || message.length === 0) return null
  if (typeof clientTurnId !== 'string' || clientTurnId.length === 0) return null
  if (typeof expectedStateVersion !== 'number') return null
  return { message, clientTurnId, expectedStateVersion }
}

function readSlotBody(body: unknown): SlotRequestBody | null {
  if (!isRecord(body)) return null
  const { value, status } = body
  if (status !== 'answered' && status !== 'declined') return null
  if (value === null) return { value: null, status }
  if (typeof value === 'string') return { value, status }
  return null
}

const SLOT_KEYS: readonly string[] = ONBOARDING_SLOTS

const onboardingService = new OnboardingService({
  repository: new OnboardingInterviewRepository(),
  chat: new AgentChatPersistenceService(),
  assignments: new UserAgentAssignmentRepository(),
})

function toInterviewView(snapshot: InterviewSnapshot): ClientInterviewView {
  return {
    id: snapshot.id,
    status: snapshot.status,
    currentObjective: snapshot.currentObjective,
    turnCount: snapshot.turnCount,
    stateVersion: snapshot.stateVersion,
    guideAgentId: snapshot.guideAgentId,
  }
}

function toSlotsView(snapshot: InterviewSnapshot): Record<string, ClientSlotView> {
  const view: Record<string, ClientSlotView> = {}
  for (const key of ONBOARDING_SLOTS) {
    const slot = snapshot.slots[key]
    view[key] = {
      status: slot?.status ?? 'unanswered',
      value: slot?.value ?? null,
      confidence: slot?.confidence ?? null,
      revision: slot?.revision ?? 0,
    }
  }
  return view
}

function toMessagesView(messages: TranscriptMessage[]): ClientMessageView[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt:
      message.createdAt instanceof Date
        ? message.createdAt.toISOString()
        : (message.createdAt ?? new Date().toISOString()),
  }))
}

function emptySlotsView(): Record<string, ClientSlotView> {
  const view: Record<string, ClientSlotView> = {}
  for (const key of ONBOARDING_SLOTS) {
    view[key] = { status: 'unanswered', value: null, confidence: null, revision: 0 }
  }
  return view
}

// Candidacy = platform agents (admin org, shared by every tenant) PLUS the
// caller's own. A strict org-equality filter would hand a fresh tenant an
// EMPTY roster and provision nobody, because every seeded agent lives in the
// admin org. Another tenant's private agents are still excluded, and these
// rows become real user_agent_assignments, so the guide is excluded too.
// logger serializes an Error to {code, name} — the message and stack are lost,
// which is exactly what is needed to tell a broken LLM call apart from a broken
// query when this only fails in production.
function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return { value: String(error) }
}

async function loadAgentCandidates(organizationId: string): Promise<AgentCandidate[]> {
  const rows = await getIntelligenceDb()
    .select({
      id: agents.id,
      name: agents.name,
      capabilities: agents.capabilities,
      role: agents.role,
      organizationId: agents.organizationId,
    })
    .from(agents)
    .where(
      and(
        eq(agents.isActive, true),
        ne(agents.id, ONBOARDING_GUIDE_AGENT_ID),
        or(eq(agents.organizationId, ADMIN_ORG_ID), eq(agents.organizationId, organizationId))
      )
    )

  return rows
    .filter((row) => isOfferableToOrg(row.organizationId, organizationId))
    .map((row) => ({
      id: row.id,
      name: row.name,
      capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
      role: typeof row.role === 'string' ? row.role : '',
    }))
}

const SlotViewSchema = t.Object({
  status: t.String(),
  value: t.Union([t.String(), t.Null()]),
  confidence: t.Union([t.Number(), t.Null()]),
  revision: t.Number(),
})

const InterviewViewSchema = t.Object({
  id: t.String(),
  status: t.String(),
  currentObjective: t.Union([t.String(), t.Null()]),
  turnCount: t.Number(),
  stateVersion: t.Number(),
  guideAgentId: t.String(),
})

const MessageViewSchema = t.Object({
  id: t.String(),
  role: t.String(),
  content: t.String(),
  createdAt: t.String(),
})

const StatusResponseSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({
    interview: t.Union([InterviewViewSchema, t.Null()]),
    slots: t.Record(t.String(), SlotViewSchema),
    messages: t.Array(MessageViewSchema),
  }),
})

const TurnResponseSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({
    reply: t.Object({ id: t.String(), content: t.String() }),
    interview: InterviewViewSchema,
    slots: t.Record(t.String(), SlotViewSchema),
  }),
})

const SlotUpdateResponseSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({
    interview: InterviewViewSchema,
    slots: t.Record(t.String(), SlotViewSchema),
  }),
})

const CompleteResponseSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({
    provisionedAgents: t.Array(
      t.Object({
        id: t.String(),
        name: t.String(),
        role: t.String(),
        rationale: t.String(),
      })
    ),
  }),
})

const SkipResponseSchema = t.Object({ success: t.Literal(true) })

const OnboardingErrorSchema = t.Object({
  success: t.Literal(false),
  error: t.String(),
  message: t.Optional(t.String()),
})

const AcceptedSchema = t.Object({
  success: t.Literal(false),
  error: t.Literal('ONBOARDING_TURN_IN_FLIGHT'),
})

export function registerOnboardingRoutes() {
  return new Elysia().group('/api/v1/onboarding', (group) =>
    withNginxAuth(group)
      .get(
        '/interview',
        async (ctx) => {
          try {
            const { id: userId, organizationId } = getNginxUser(ctx)
            const status = await onboardingService.getStatus(userId, organizationId)

            return {
              success: true as const,
              data: {
                interview: status.interview === null ? null : toInterviewView(status.interview),
                slots:
                  status.interview === null ? emptySlotsView() : toSlotsView(status.interview),
                messages: toMessagesView(status.messages as TranscriptMessage[]),
              },
            }
          } catch (error) {
            logger.error('Failed to load onboarding status', { error: describeError(error) })
            ctx.set.status = 500
            return { success: false as const, error: 'ONBOARDING_STATUS_FAILED' }
          }
        },
        { response: { 200: StatusResponseSchema, 500: OnboardingErrorSchema } }
      )

      .post(
        '/interview',
        async (ctx) => {
          try {
            const { id: userId, organizationId } = getNginxUser(ctx)
            const started = await onboardingService.startInterview(userId, organizationId)

            if (started.outcome === 'already_finished') {
              ctx.set.status = 409
              return { success: false as const, error: 'ONBOARDING_ALREADY_FINISHED' }
            }

            return {
              success: true as const,
              data: {
                interview: toInterviewView(started.interview),
                slots: toSlotsView(started.interview),
                messages: toMessagesView(started.messages as TranscriptMessage[]),
              },
            }
          } catch (error) {
            logger.error('Failed to start the onboarding interview', {
              error: describeError(error),
            })
            ctx.set.status = 500
            return { success: false as const, error: 'ONBOARDING_START_FAILED' }
          }
        },
        {
          response: {
            200: StatusResponseSchema,
            409: OnboardingErrorSchema,
            500: OnboardingErrorSchema,
          },
        }
      )

      .post(
        '/interview/turns',
        async (ctx) => {
          const { id: userId, organizationId } = getNginxUser(ctx)

          const turnBody = readTurnBody(ctx.body)
          if (turnBody === null) {
            ctx.set.status = 400
            return { success: false as const, error: 'ONBOARDING_INVALID_TURN' }
          }

          const result = await onboardingService.submitTurn({
            userId,
            organizationId,
            message: turnBody.message,
            clientTurnId: turnBody.clientTurnId,
            expectedStateVersion: turnBody.expectedStateVersion,
          })

          switch (result.outcome) {
            case 'not_found':
              ctx.set.status = 404
              return { success: false as const, error: 'ONBOARDING_INTERVIEW_NOT_FOUND' }
            case 'conflict':
              ctx.set.status = 409
              return { success: false as const, error: 'ONBOARDING_STATE_CONFLICT' }
            case 'processing':
              ctx.set.status = 202
              return { success: false as const, error: 'ONBOARDING_TURN_IN_FLIGHT' as const }
            case 'extraction_failed':
              ctx.set.status = 503
              return { success: false as const, error: 'ONBOARDING_EXTRACTION_FAILED' }
            case 'replayed':
            case 'committed':
              return {
                success: true as const,
                data: {
                  reply: { id: result.interview.id, content: result.reply },
                  interview: toInterviewView(result.interview),
                  slots: toSlotsView(result.interview),
                },
              }
          }
        },
        {
          body: t.Object({
            message: t.String({ minLength: 1 }),
            clientTurnId: t.String({ minLength: 1 }),
            expectedStateVersion: t.Number(),
          }),
          response: {
            200: TurnResponseSchema,
            202: AcceptedSchema,
            400: OnboardingErrorSchema,
            404: OnboardingErrorSchema,
            409: OnboardingErrorSchema,
            503: OnboardingErrorSchema,
          },
        }
      )

      .put(
        '/interview/slots/:slotKey',
        async (ctx) => {
          const { id: userId, organizationId } = getNginxUser(ctx)

          if (!SLOT_KEYS.includes(ctx.params.slotKey)) {
            ctx.set.status = 400
            return { success: false as const, error: 'ONBOARDING_UNKNOWN_SLOT' }
          }

          const slotBody = readSlotBody(ctx.body)
          if (slotBody === null) {
            ctx.set.status = 400
            return { success: false as const, error: 'ONBOARDING_INVALID_SLOT_UPDATE' }
          }

          const result = await onboardingService.updateSlot({
            userId,
            organizationId,
            slotKey: ctx.params.slotKey as OnboardingSlot,
            value: slotBody.value ?? '',
            status: slotBody.status,
          })

          switch (result.outcome) {
            case 'not_found':
              ctx.set.status = 404
              return { success: false as const, error: 'ONBOARDING_INTERVIEW_NOT_FOUND' }
            case 'conflict':
              ctx.set.status = 409
              return { success: false as const, error: 'ONBOARDING_STATE_CONFLICT' }
            case 'committed':
              return {
                success: true as const,
                data: {
                  interview: toInterviewView(result.interview),
                  slots: toSlotsView(result.interview),
                },
              }
          }
        },
        {
          params: t.Object({ slotKey: t.String() }),
          body: t.Object({
            value: t.Union([t.String(), t.Null()]),
            status: t.Union([t.Literal('answered'), t.Literal('declined')]),
          }),
          response: {
            200: SlotUpdateResponseSchema,
            400: OnboardingErrorSchema,
            404: OnboardingErrorSchema,
            409: OnboardingErrorSchema,
          },
        }
      )

      .post(
        '/interview/complete',
        async (ctx) => {
          const { id: userId, organizationId } = getNginxUser(ctx)

          const candidates = await loadAgentCandidates(organizationId)
          const result = await onboardingService.completeInterview(
            userId,
            organizationId,
            undefined,
            candidates
          )

          switch (result.outcome) {
            case 'not_found':
              ctx.set.status = 404
              return { success: false as const, error: 'ONBOARDING_INTERVIEW_NOT_FOUND' }
            case 'not_ready':
              ctx.set.status = 409
              return { success: false as const, error: 'ONBOARDING_NOT_READY' }
            case 'completed':
              return {
                success: true as const,
                data: {
                  provisionedAgents: result.provisionedAgents.map((agent) => ({
                    id: agent.agentId,
                    name: agent.agentName,
                    role: '',
                    rationale: agent.rationale,
                  })),
                },
              }
          }
        },
        {
          response: {
            200: CompleteResponseSchema,
            404: OnboardingErrorSchema,
            409: OnboardingErrorSchema,
          },
        }
      )

      .post(
        '/interview/skip',
        async (ctx) => {
          const { id: userId, organizationId } = getNginxUser(ctx)

          const current = await onboardingService.getStatus(userId, organizationId)
          if (current.interview !== null) {
            await onboardingService.skipInterview(userId, organizationId, current.interview.id)
          }

          return { success: true as const }
        },
        { response: { 200: SkipResponseSchema } }
      )
  )
}
