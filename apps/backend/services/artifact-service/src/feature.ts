import { DatabaseService } from '@uaip/shared-services'
import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import type { EventBusService } from '@uaip/shared-services/event-bus'
import type { EventBusMessage } from '@uaip/types'
import type {
  ArtifactGenerationRequest,
  ArtifactConversationContext,
  ConversationMessage,
  Participant,
} from '@uaip/types'
import { logger, isRecord } from '@uaip/utils'

import { ArtifactService } from './artifact_service.js'
import { registerArtifactRoutes } from './routes/artifact_routes.js'
import { registerShortLinkRoutes } from './routes/short_link_routes.js'
import { isArtifactType } from './artifact_types.js'

let artifactService: ArtifactService

async function ensureArtifactService(bus: EventBusService): Promise<ArtifactService> {
  if (!artifactService) {
    artifactService = new ArtifactService(bus)
    await artifactService.initialize()
  }
  return artifactService
}

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | Date | JsonObject | JsonValue[]
type JsonObject = {
  [key: string]: JsonValue
}
type DatabaseRowLike = Record<string, JsonValue>

type DiscussionRowLike = DatabaseRowLike & {
  id: string
  status: string
  completionReason: string | null
  updatedAt: Date
}

type ParticipantRowLike = DatabaseRowLike & {
  id: string
  discussionId: string
  agentId: string | null
  userId: string | null
  role: string
  joinedAt: Date
}

type MessageRowLike = DatabaseRowLike & {
  id: string
  discussionId: string
  content: string
  participantId: string | null
  timestamp: Date
  createdAt: Date
  metadata: JsonValue
}

type CompletedDiscussionArtifactData = Record<string, unknown>

const RECONCILE_COMPLETED_DISCUSSION_LIMIT = 25

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function buildReconciledArtifactGeneration(
  discussion: DiscussionRowLike
): Record<string, unknown> {
  const discussionMetadata = isRecordValue(discussion.metadata) ? discussion.metadata : {}
  const artifactConfig = isRecordValue(discussionMetadata.artifactConfig)
    ? discussionMetadata.artifactConfig
    : {}
  const configuredType = artifactConfig.artifactType
  const suggestedType = isArtifactType(configuredType) ? configuredType : 'documentation'

  return {
    suggestedType,
    generateOnCompletion: artifactConfig.generateOnCompletion !== false,
    autoShare: artifactConfig.autoShare !== false,
    requiresApproval: artifactConfig.requiresApproval === true,
    metadata: {
      reconciled: true,
      ...(isRecordValue(artifactConfig.metadata) ? artifactConfig.metadata : {}),
    },
  }
}

async function handleDiscussionCompletedArtifact(
  bus: EventBusService,
  data: CompletedDiscussionArtifactData,
  generator: string
): Promise<void> {
  const discussionId = typeof data.discussionId === 'string' ? data.discussionId : 'unknown'
  const discussion = isRecord(data.discussion) ? data.discussion : {}
  const artifactGeneration = isRecord(data.artifactGeneration) ? data.artifactGeneration : {}

  if (artifactGeneration.generateOnCompletion === false) {
    logger.info('artifact-service: skipping generation, generateOnCompletion=false', { discussionId })
    return
  }

  const rawParticipants = Array.isArray(data.participants) ? data.participants : []

  const participants: Participant[] = rawParticipants.filter(isRecord).map((p) => ({
    id: typeof p.id === 'string' ? p.id : '',
    name: typeof (p.agentId ?? p.userId) === 'string' ? String(p.agentId ?? p.userId) : 'unknown',
    role: typeof p.role === 'string' ? p.role : 'participant',
    type: typeof p.agentId === 'string' ? ('agent' as const) : ('human' as const),
  }))
  const roleById = new Map<string, 'user' | 'assistant'>()
  for (const p of rawParticipants.filter(isRecord)) {
    if (typeof p.id === 'string') {
      roleById.set(p.id, typeof p.agentId === 'string' ? 'assistant' : 'user')
    }
  }

  const rawMessages = Array.isArray(data.messages) ? data.messages : []
  const messages: ConversationMessage[] = rawMessages.filter(isRecord).map((m) => {
    const participantId = typeof m.participantId === 'string' ? m.participantId : ''
    const timestamp = m.timestamp instanceof Date ? m.timestamp : new Date(String(m.timestamp ?? ''))
    return {
      id: typeof m.id === 'string' ? m.id : '',
      content: typeof m.content === 'string' ? m.content : '',
      role: roleById.get(participantId) ?? 'assistant',
      timestamp,
      metadata: isRecord(m.metadata) ? m.metadata : undefined,
    }
  })

  const suggestedType =
    typeof artifactGeneration.suggestedType === 'string' ? artifactGeneration.suggestedType : 'documentation'
  const artifactType = isArtifactType(suggestedType) ? suggestedType : 'documentation'

  const firstAgent = rawParticipants.filter(isRecord).find((p) => typeof p.agentId === 'string')
  const discussionCreatedBy =
    typeof discussion.createdBy === 'string'
      ? discussion.createdBy
      : typeof discussion.completedBy === 'string'
        ? discussion.completedBy
        : undefined

  const context: ArtifactConversationContext = {
    conversationId: discussionId,
    messages,
    participants,
    topics: [],
    decisions: [],
    actionItems: [],
    discussion: {
      id: typeof discussion.id === 'string' ? discussion.id : discussionId,
      messages,
      participants,
    },
    agent: firstAgent && typeof firstAgent.agentId === 'string' ? { id: firstAgent.agentId } : undefined,
    metadata: {
      ...(isRecord(artifactGeneration.metadata) ? artifactGeneration.metadata : {}),
      ...(discussionCreatedBy ? { userId: discussionCreatedBy } : {}),
    },
  }

  const request: ArtifactGenerationRequest = {
    type: artifactType,
    context,
    metadata: {
      triggeredBy: generator,
      discussionId,
      completionReason:
        typeof discussion.completionReason === 'string' ? discussion.completionReason : undefined,
      priority: artifactGeneration.priority,
    },
  }

  try {
    const service = await ensureArtifactService(bus)
    logger.info('artifact-service: generating artifact from completed discussion', {
      discussionId,
      suggestedType: artifactType,
      generator,
    })
    const response = await service.generateAndPersistArtifact(request, {
      generator,
    })

    if (response.success && response.persistedArtifact) {
      await bus.publish('artifact.generated', {
        discussionId,
        artifact: response.persistedArtifact,
        metadata: response.metadata,
      })
      logger.info('artifact-service: artifact.generated published', {
        discussionId,
        artifactId: response.persistedArtifact.id,
      })
    } else {
      await bus
        .publish('artifact.generation.failed', { discussionId, error: response.error })
        .catch(() => undefined)
      logger.warn('artifact-service: generation returned failure', { discussionId, error: response.error })
    }
  } catch (error) {
    logger.error('artifact-service: completed discussion handler threw', {
      discussionId,
      error: error instanceof Error ? error.message : String(error),
    })
    await bus
      .publish('artifact.generation.failed', {
        discussionId,
        error: {
          code: 'HANDLER_EXCEPTION',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      })
      .catch(() => undefined)
  }
}

async function reconcileCompletedDiscussionsWithoutArtifacts(bus: EventBusService): Promise<void> {
  try {
    const databaseService = DatabaseService.getInstance()
    const artifactRepository = databaseService.getArtifactRepository()
    const discussions = await databaseService.findMany<DiscussionRowLike>(
      'discussions',
      { status: 'completed' },
      { order: { updatedAt: 'DESC' }, take: RECONCILE_COMPLETED_DISCUSSION_LIMIT }
    )

    for (const discussion of discussions) {
      // oxlint-disable-next-line no-await-in-loop -- reconciliation is intentionally sequential to avoid provider bursts on startup
      const existingArtifacts = await artifactRepository.findByConversationId(discussion.id)
      if (existingArtifacts.length > 0) {
        continue
      }

      // oxlint-disable-next-line no-await-in-loop -- reconciliation is intentionally sequential to avoid provider bursts on startup
      const participants = await databaseService.findMany<ParticipantRowLike>(
        'discussion_participants',
        { discussionId: discussion.id },
        { order: { joinedAt: 'ASC' } }
      )
      // oxlint-disable-next-line no-await-in-loop -- reconciliation is intentionally sequential to avoid provider bursts on startup
      const messages = await databaseService.findMany<MessageRowLike>(
        'discussion_messages',
        { discussionId: discussion.id },
        { order: { createdAt: 'ASC' } }
      )

      // oxlint-disable-next-line no-await-in-loop -- reconciliation is intentionally sequential to avoid provider bursts on startup
      await handleDiscussionCompletedArtifact(
        bus,
        {
          discussionId: discussion.id,
          discussion,
          participants,
          messages,
          artifactGeneration: buildReconciledArtifactGeneration(discussion),
        },
        'discussion.completed.reconcile'
      )
    }
  } catch (error) {
    logger.error('artifact-service: completed discussion reconciliation failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export const artifactFeature: Feature = {
  name: 'artifact-service',

  async initialize(deps: ServiceDeps): Promise<void> {
    await ensureArtifactService(deps.eventBusService)
    logger.info('artifact-service feature initialized')
  },

  routes(app) {
    app.use(registerArtifactRoutes(artifactService))
    app.use(registerShortLinkRoutes())
    return app
  },

  async events(bus: EventBusService): Promise<void> {
    await bus.subscribe('discussion.completed', async (event: EventBusMessage) => {
      const rawData: unknown = isRecord(event.data) ? event.data : event
      const data: Record<string, unknown> = isRecord(rawData) ? rawData : {}
      await handleDiscussionCompletedArtifact(bus, data, 'discussion.completed')
    })

    // Do not block registration of later feature subscriptions on startup
    // reconciliation. The LLM feature must be able to register its request
    // worker before reconciliation emits any generation requests.
    void reconcileCompletedDiscussionsWithoutArtifacts(bus)
    logger.info('artifact-service event subscriptions configured')
  },
}
