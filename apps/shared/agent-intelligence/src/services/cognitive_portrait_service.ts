import { logger } from '@uaip/utils'
import { EventBusService } from '@uaip/infra'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
import type {
  CognitivePortrait,
  UserCognitiveProfile,
  TrustCalibration,
  TrustCalibrationEvent,
  PersonalizationVector,
  PersonalizationDimensions,
  InteractionPatternSummary,
  CommunicationStyle,
  CognitivePortraitRequest,
  CognitivePortraitResponse,
  DomainExpertiseEntry,
  ToolPreferenceEntry,
} from '@uaip/types'
import { TrustAction } from '@uaip/types'
import {
  WorkStyle,
  CommunicationPreference,
  WorkflowStyle,
  ProblemSolvingApproach,
  DecisionMakingStyle,
  LearningStyle,
  ExpertiseLevel,
  TRUST_OVERRIDE_DELTA,
  TRUST_ACCEPT_DELTA,
  DEFAULT_CONFIDENCE_THRESHOLD,
  CONFIDENCE_THRESHOLD_MIN,
  CONFIDENCE_THRESHOLD_MAX,
} from '@uaip/types'

// ─── In-memory cache ─────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000
const portraitCache = new Map<string, { portrait: CognitivePortrait; cachedAt: number }>()
const chatEvidenceByUser = new Map<string, ChatEvidenceEntry[]>()

type ChatEvidenceEntry = {
  content: string
  observedAt: string
}

type DomainSignal = {
  domain: string
  terms: string[]
}

const DOMAIN_SIGNALS: DomainSignal[] = [
  { domain: 'backend', terms: ['api', 'database', 'postgres', 'redis', 'queue', 'elysia', 'service'] },
  { domain: 'frontend', terms: ['react', 'component', 'ui', 'tailwind', 'vite', 'browser', 'layout'] },
  { domain: 'security', terms: ['auth', 'jwt', 'oauth', 'permission', 'csrf', 'token', 'policy'] },
  { domain: 'data', terms: ['metrics', 'analytics', 'qdrant', 'embedding', 'vector', 'dataset', 'query'] },
  { domain: 'product', terms: ['stakeholder', 'requirement', 'roadmap', 'user', 'prd', 'workflow', 'decision'] },
]

function getCachedPortrait(userId: string): CognitivePortrait | null {
  const entry = portraitCache.get(userId)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    portraitCache.delete(userId)
    return null
  }
  return entry.portrait
}

function cachePortrait(portrait: CognitivePortrait): void {
  portraitCache.set(portrait.userId, { portrait, cachedAt: Date.now() })
}

function extractContent(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (!isRecord(value)) return null
  const content = value.content ?? value.message ?? value.text ?? value.prompt ?? value.response
  return typeof content === 'string' && content.trim().length > 0 ? content : null
}

function recordChatEvidence(userId: string, content: string, observedAt = new Date().toISOString()): void {
  const existing = chatEvidenceByUser.get(userId) ?? []
  chatEvidenceByUser.set(userId, [...existing.slice(-199), { content, observedAt }])
}

export function recordCognitivePortraitChatEvidence(
  userId: string,
  messages: unknown[],
  observedAt = new Date().toISOString()
): void {
  for (const message of messages) {
    const content = extractContent(message)
    if (content) recordChatEvidence(userId, content, observedAt)
  }
  portraitCache.delete(userId)
}

function levelForEvidenceCount(count: number): ExpertiseLevel {
  if (count >= 10) return ExpertiseLevel.EXPERT
  if (count >= 6) return ExpertiseLevel.ADVANCED
  if (count >= 3) return ExpertiseLevel.INTERMEDIATE
  return ExpertiseLevel.NOVICE
}

function aggregateDomainExpertise(evidence: ChatEvidenceEntry[]): DomainExpertiseEntry[] {
  const byDomain = new Map<string, { count: number; lastDemonstrated: string }>()

  for (const entry of evidence) {
    const lowerContent = entry.content.toLowerCase()
    for (const signal of DOMAIN_SIGNALS) {
      if (!signal.terms.some((term) => lowerContent.includes(term))) continue
      const current = byDomain.get(signal.domain)
      byDomain.set(signal.domain, {
        count: (current?.count ?? 0) + 1,
        lastDemonstrated:
          current && current.lastDemonstrated > entry.observedAt
            ? current.lastDemonstrated
            : entry.observedAt,
      })
    }
  }

  return Array.from(byDomain.entries())
    .map(([domain, value]): DomainExpertiseEntry => ({
      domain,
      level: levelForEvidenceCount(value.count),
      confidence: Math.min(0.95, 0.35 + value.count * 0.08),
      lastDemonstrated: value.lastDemonstrated,
      evidenceCount: value.count,
    }))
    .sort((a, b) => b.evidenceCount - a.evidenceCount)
}

// ─── Default profile ─────────────────────────────────────────────────────

function getDefaultProfile(): UserCognitiveProfile {
  return {
    workStyle: WorkStyle.ADAPTIVE,
    communicationPreference: CommunicationPreference.DETAILED,
    domainExpertise: [],
    toolPreferences: [],
    workflowStyle: WorkflowStyle.ITERATIVE,
    problemSolvingApproach: ProblemSolvingApproach.SYSTEMATIC,
    decisionMaking: DecisionMakingStyle.DATA_DRIVEN,
    learningStyle: LearningStyle.DOING,
  }
}

function getDefaultTrustCalibration(): TrustCalibration {
  return {
    confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
    overrideCount: 0,
    acceptCount: 0,
    overrideRate: 0,
    lastCalibrated: new Date().toISOString(),
    history: [],
  }
}

function getDefaultPersonalizationVector(): PersonalizationVector {
  return {
    relevanceWeight: DEFAULT_CONFIDENCE_THRESHOLD,
    dimensions: {
      vectorWeight: 0.5,
      graphWeight: 0.2,
      recencyWeight: 0.1,
      explicitWeight: 0.2,
      personalPatternWeight: 0.0,
    },
    computedAt: new Date().toISOString(),
  }
}

function getDefaultPortrait(userId: string): CognitivePortrait {
  return {
    userId,
    profile: getDefaultProfile(),
    trustCalibration: getDefaultTrustCalibration(),
    personalizationVector: getDefaultPersonalizationVector(),
    interactionPatterns: {
      totalInteractions: 0,
      averageSessionDuration: 0,
      peakActivityHours: [],
      preferredPortals: [],
      preferredIntents: [],
      boardProviderUsage: {},
      averageResponseLength: 0,
      domainVocabularyDensity: 0,
    },
    communicationStyle: {
      formality: 0.5,
      verbosity: 0.5,
      technicalDepth: 0.5,
      preferredLanguage: 'en',
      domainTermFrequency: {},
    },
    lastUpdated: new Date().toISOString(),
    version: 1,
  }
}

// ─── Aggregation stubs ───────────────────────────────────────────────────

async function aggregateFromChatHistory(userId: string): Promise<Partial<UserCognitiveProfile>> {
  const evidence = chatEvidenceByUser.get(userId) ?? []
  return {
    domainExpertise: aggregateDomainExpertise(evidence),
  }
}

async function aggregateFromInteractionPatterns(_userId: string): Promise<InteractionPatternSummary> {
  return {
    totalInteractions: 0,
    averageSessionDuration: 0,
    peakActivityHours: [],
    preferredPortals: [],
    preferredIntents: [],
    boardProviderUsage: {},
    averageResponseLength: 0,
    domainVocabularyDensity: 0,
  }
}

async function aggregateFromToolUsage(_userId: string): Promise<ToolPreferenceEntry[]> {
  return []
}

async function aggregateFromOverrideAcceptRatio(userId: string): Promise<TrustCalibration> {
  const existing = getCachedPortrait(userId)
  return existing?.trustCalibration ?? getDefaultTrustCalibration()
}

async function aggregateFromCommunicationStyle(_userId: string): Promise<CommunicationStyle> {
  return {
    formality: 0.5,
    verbosity: 0.5,
    technicalDepth: 0.5,
    preferredLanguage: 'en',
    domainTermFrequency: {},
  }
}

// ─── Personalization computation ─────────────────────────────────────────

function computePersonalizationVector(
  profile: UserCognitiveProfile,
  trust: TrustCalibration
): PersonalizationVector {
  const baseWeight = trust.confidenceThreshold
  const hasExpertise = profile.domainExpertise.length > 0
  const hasToolPrefs = profile.toolPreferences.length > 0

  const personalPatternWeight = hasExpertise || hasToolPrefs ? 0.15 : 0.0
  const remaining = 1.0 - personalPatternWeight

  const dimensions: PersonalizationDimensions = {
    vectorWeight: 0.5 * remaining,
    graphWeight: 0.2 * remaining,
    recencyWeight: 0.1 * remaining,
    explicitWeight: 0.2 * remaining,
    personalPatternWeight,
  }

  return {
    relevanceWeight: baseWeight,
    dimensions,
    computedAt: new Date().toISOString(),
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

export async function getPortrait(request: CognitivePortraitRequest): Promise<CognitivePortraitResponse> {
  const { userId, forceRecompute } = request

  if (!forceRecompute) {
    const cached = getCachedPortrait(userId)
    if (cached) {
      return { portrait: cached, computedAt: cached.lastUpdated, fromCache: true }
    }
  }

  logger.info('Computing cognitive portrait', { userId, forceRecompute })

  const [chatProfile, interactionPatterns, toolPreferences, trustCalibration, communicationStyle] =
    await Promise.all([
      aggregateFromChatHistory(userId),
      aggregateFromInteractionPatterns(userId),
      aggregateFromToolUsage(userId),
      aggregateFromOverrideAcceptRatio(userId),
      aggregateFromCommunicationStyle(userId),
    ])

  const defaultProfile = getDefaultProfile()
  const profile: UserCognitiveProfile = {
    ...defaultProfile,
    ...chatProfile,
    toolPreferences,
  }

  const personalizationVector = computePersonalizationVector(profile, trustCalibration)

  const portrait: CognitivePortrait = {
    userId,
    profile,
    trustCalibration,
    personalizationVector,
    interactionPatterns,
    communicationStyle,
    lastUpdated: new Date().toISOString(),
    version: (getCachedPortrait(userId)?.version ?? 0) + 1,
  }

  cachePortrait(portrait)
  logger.info('Cognitive portrait computed', { userId, version: portrait.version })

  return { portrait, computedAt: portrait.lastUpdated, fromCache: false }
}

export async function updateTrustCalibration(
  userId: string,
  action: TrustAction,
  agentId: string,
  context: string
): Promise<TrustCalibration> {
  const existing = getCachedPortrait(userId) ?? getDefaultPortrait(userId)
  const trust = { ...existing.trustCalibration }

  const previousThreshold = trust.confidenceThreshold
  // Override → tighten by 0.02, Accept → loosen by 0.01
  const delta = action === 'override' ? TRUST_OVERRIDE_DELTA : TRUST_ACCEPT_DELTA
  trust.confidenceThreshold = Math.max(
    CONFIDENCE_THRESHOLD_MIN,
    Math.min(CONFIDENCE_THRESHOLD_MAX, trust.confidenceThreshold + delta)
  )

  if (action === 'override') {
    trust.overrideCount += 1
  } else {
    trust.acceptCount += 1
  }

  const total = trust.overrideCount + trust.acceptCount
  trust.overrideRate = total > 0 ? trust.overrideCount / total : 0
  trust.lastCalibrated = new Date().toISOString()

  const event: TrustCalibrationEvent = {
    timestamp: new Date().toISOString(),
    action,
    agentId,
    context,
    previousThreshold,
    newThreshold: trust.confidenceThreshold,
  }
  trust.history = [...trust.history.slice(-99), event]

  const updatedPortrait: CognitivePortrait = {
    ...existing,
    trustCalibration: trust,
    personalizationVector: computePersonalizationVector(existing.profile, trust),
    lastUpdated: new Date().toISOString(),
    version: existing.version + 1,
  }

  cachePortrait(updatedPortrait)

  try {
    const eventBus = EventBusService.getInstance()
    await eventBus.publish('cognitive.portrait.trust.updated', {
      userId,
      action,
      previousThreshold,
      newThreshold: trust.confidenceThreshold,
      timestamp: event.timestamp,
    })
  } catch (error) {
    logger.warn('Failed to publish trust calibration event', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  logger.info('Trust calibration updated', {
    userId,
    action,
    previousThreshold,
    newThreshold: trust.confidenceThreshold,
  })

  return trust
}

export function getPersonalizationVector(userId: string): PersonalizationVector {
  const cached = getCachedPortrait(userId)
  return cached?.personalizationVector ?? getDefaultPersonalizationVector()
}

export function initCognitivePortraitEventListeners(): void {
  try {
    const eventBus = EventBusService.getInstance()

    eventBus.subscribe('user.decision.override', async (data: unknown) => {
      if (!isRecord(data)) return;
      const userId = typeof data['userId'] === 'string' ? data['userId'] : '';
      const agentId = typeof data['agentId'] === 'string' ? data['agentId'] : '';
      const context = typeof data['context'] === 'string' ? data['context'] : '';
      if (userId) {
        await updateTrustCalibration(userId, TrustAction.OVERRIDE, agentId, context)
      }
    })

    eventBus.subscribe('user.decision.accept', async (data: unknown) => {
      if (!isRecord(data)) return;
      const userId = typeof data['userId'] === 'string' ? data['userId'] : '';
      const agentId = typeof data['agentId'] === 'string' ? data['agentId'] : '';
      const context = typeof data['context'] === 'string' ? data['context'] : '';
      if (userId) {
        await updateTrustCalibration(userId, TrustAction.ACCEPT, agentId, context)
      }
    })

    eventBus.subscribe('user.interaction', async (data: unknown) => {
      if (!isRecord(data)) return;
      const userId = typeof data['userId'] === 'string' ? data['userId'] : '';
      if (userId) {
        const observedAt = typeof data['timestamp'] === 'string' ? data['timestamp'] : new Date().toISOString()
        if (Array.isArray(data['messages'])) {
          recordCognitivePortraitChatEvidence(userId, data['messages'], observedAt)
        } else {
          const content = extractContent(data)
          if (content) recordChatEvidence(userId, content, observedAt)
        }
        portraitCache.delete(userId)
      }
    })

    logger.info('Cognitive portrait event listeners initialized')
  } catch (error) {
    logger.warn('Failed to initialize cognitive portrait event listeners', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
