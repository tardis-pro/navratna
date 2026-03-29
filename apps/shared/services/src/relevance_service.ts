import { RedisCacheService } from '@uaip/infra'
import { logger } from '@uaip/utils'
import { QdrantService } from './qdrant_service'
import { EmbeddingService } from './knowledge-graph/embedding_service'
import { ToolGraphDatabase } from './database/tool_graph_database'
import { ServiceFactory } from './service_factory'

const DEFAULT_WEIGHTS = {
  vector: 0.4,
  graph: 0.3,
  recency: 0.2,
  explicit: 0.1,
} as const

const DEFAULT_LIMIT = 10
const RELATIONSHIP_TYPES = ['knows', 'uses', 'related_to']
const RECENCY_ZSET_KEY = 'agent-intelligence:relevance:recency'
const RECENCY_TTL_SECONDS = 60 * 60 * 24 * 7

let embeddingService: EmbeddingService | null = null
let qdrantService: QdrantService | null = null
let redisService: RedisCacheService | null = null
let graphDatabase: ToolGraphDatabase | null = null
let graphInitAttempted = false

function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService()
  }
  return embeddingService
}

async function getQdrantService(): Promise<QdrantService> {
  if (!qdrantService) {
    qdrantService = await ServiceFactory.getInstance().getQdrantService()
  }
  return qdrantService
}

function getRedisService(): RedisCacheService {
  if (!redisService) {
    redisService = RedisCacheService.getInstance()
  }
  return redisService
}

async function getGraphDatabase(): Promise<ToolGraphDatabase | null> {
  if (!graphDatabase) {
    graphDatabase = await ServiceFactory.getInstance().getToolGraphDatabase()
  }

  if (!graphInitAttempted) {
    graphInitAttempted = true
    try {
      await graphDatabase.verifyConnectivity(2)
    } catch (error) {
      logger.warn('Graph connectivity initialization failed for relevance scoring', { error })
    }
  }

  return graphDatabase
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .filter((term) => term.length > 1)
    )
  )
}

function normalizeWeights(
  input?: {
    vector: number
    graph: number
    recency: number
    explicit: number
  }
) {
  const merged = {
    vector: input?.vector ?? DEFAULT_WEIGHTS.vector,
    graph: input?.graph ?? DEFAULT_WEIGHTS.graph,
    recency: input?.recency ?? DEFAULT_WEIGHTS.recency,
    explicit: input?.explicit ?? DEFAULT_WEIGHTS.explicit,
  }
  const total = merged.vector + merged.graph + merged.recency + merged.explicit
  if (total <= 0) return { ...DEFAULT_WEIGHTS }

  return {
    vector: merged.vector / total,
    graph: merged.graph / total,
    recency: merged.recency / total,
    explicit: merged.explicit / total,
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index]
    normA += a[index] * a[index]
    normB += b[index] * b[index]
  }

  if (normA === 0 || normB === 0) return 0
  const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB))
  return Math.max(0, Math.min(1, (similarity + 1) / 2))
}

function metadataToKeywords(metadata?: Record<string, unknown>): string[] {
  if (!metadata) return []

  const collected: string[] = []
  if (Array.isArray(metadata.keywords)) {
    collected.push(...metadata.keywords.map((item) => String(item)))
  }

  const searchableFields = ['name', 'role', 'title', 'description', 'summary', 'tags']
  for (const field of searchableFields) {
    const value = metadata[field]
    if (typeof value === 'string') {
      collected.push(value)
    } else if (Array.isArray(value)) {
      collected.push(...value.map((entry) => String(entry)))
    }
  }

  return tokenize(collected.join(' '))
}

async function buildQueryVector(query: string): Promise<number[] | null> {
  try {
    return await getEmbeddingService().generateEmbedding(query)
  } catch (error) {
    logger.warn('Failed to build query embedding, vector score fallback enabled', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function fetchMissingCandidateVectors(
  candidates: Array<{ id: string; vector?: number[] }>
): Promise<Map<string, number[]>> {
  const vectors = new Map<string, number[]>()
  const idsToFetch = candidates.filter((candidate) => !candidate.vector).map((candidate) => candidate.id)

  if (idsToFetch.length === 0) return vectors

  try {
    const points = await (await getQdrantService()).getPoints(idsToFetch)
    for (const point of points) {
      if (Array.isArray(point.vector)) {
        vectors.set(String(point.id), point.vector)
      }
    }
  } catch (error) {
    logger.warn('Failed to fetch candidate vectors from Qdrant', {
      error: error instanceof Error ? error.message : String(error),
      requestedCount: idsToFetch.length,
    })
  }

  return vectors
}

async function computeGraphScore(candidateId: string, terms: string[]): Promise<number> {
  if (terms.length === 0) return 0

  try {
    const db = await getGraphDatabase()
    if (!db) return 0

    const result = await db.executeWithRetry(
      async (session) =>
        session.run(
          `
          MATCH (c {id: $candidateId})
          OPTIONAL MATCH (c)-[r]-(n)
          WHERE toLower(type(r)) IN $relationshipTypes
          WITH collect(DISTINCT n) AS neighbors, collect(DISTINCT toLower(type(r))) AS relTypes
          WITH neighbors, relTypes,
               [term IN $terms WHERE any(n IN neighbors WHERE
                 toLower(coalesce(n.name, '')) CONTAINS term OR
                 toLower(coalesce(n.title, '')) CONTAINS term OR
                 toLower(coalesce(n.description, '')) CONTAINS term OR
                 toLower(coalesce(n.content, '')) CONTAINS term OR
                 any(keyword IN coalesce(n.keywords, []) WHERE toLower(keyword) CONTAINS term)
               )] AS matchedTerms
          RETURN size(matchedTerms) AS matchedTermCount,
                 size($terms) AS totalTermCount,
                 size(relTypes) AS relTypeCount
        `,
          {
            candidateId,
            terms,
            relationshipTypes: RELATIONSHIP_TYPES,
          }
        ),
      'Relevance graph scoring'
    )

    if (!result.records.length) return 0
    const record = result.records[0]
    const matchedTermCount = Number(record.get('matchedTermCount') || 0)
    const totalTermCount = Number(record.get('totalTermCount') || terms.length || 1)
    const relTypeCount = Number(record.get('relTypeCount') || 0)
    const termCoverage = Math.min(1, matchedTermCount / Math.max(1, totalTermCount))
    const relationDiversity = Math.min(1, relTypeCount / RELATIONSHIP_TYPES.length)
    return Math.max(0, Math.min(1, termCoverage * 0.8 + relationDiversity * 0.2))
  } catch (error) {
    logger.warn('Graph score calculation failed', {
      candidateId,
      error: error instanceof Error ? error.message : String(error),
    })
    return 0
  }
}

async function getRecencyScores(candidates: Array<{ id: string }>): Promise<Map<string, number>> {
  const scores = new Map<string, number>()

  try {
    const client = await getRedisService().getClient()
    if (!client) return scores

    const rawScores = await Promise.all(
      candidates.map(async (candidate) => ({
        id: candidate.id,
        score: Number((await client.zscore(RECENCY_ZSET_KEY, candidate.id)) || 0),
      }))
    )

    const maxScore = rawScores.reduce((max, item) => Math.max(max, item.score), 0)
    for (const item of rawScores) {
      scores.set(item.id, maxScore > 0 ? item.score / maxScore : 0)
    }
  } catch (error) {
    logger.warn('Recency score lookup failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return scores
}

async function bumpRecencyScores(
  results: Array<{ id: string; score: number }>
): Promise<void> {
  try {
    const client = await getRedisService().getClient()
    if (!client) return

    const pipeline = client.multi()
    for (const result of results) {
      pipeline.zincrby(RECENCY_ZSET_KEY, Math.max(0.01, result.score), result.id)
    }
    pipeline.expire(RECENCY_ZSET_KEY, RECENCY_TTL_SECONDS)
    await pipeline.exec()
  } catch (error) {
    logger.warn('Failed to update recency scores', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function explicitKeywordScore(queryTerms: string[], candidateKeywords: string[]): number {
  if (queryTerms.length === 0 || candidateKeywords.length === 0) return 0

  const candidateSet = new Set(candidateKeywords)
  let matches = 0
  for (const term of queryTerms) {
    if (candidateSet.has(term)) matches += 1
  }
  return Math.min(1, matches / queryTerms.length)
}

export async function scoreRelevance(input: {
  query: string
  candidates: Array<{
    id: string
    type: 'agent' | 'sop' | 'task' | 'knowledge' | 'capability'
    vector?: number[]
    metadata?: Record<string, unknown>
  }>
  weights?: {
    vector: number
    graph: number
    recency: number
    explicit: number
  }
  limit?: number
}): Promise<
  Array<{
    id: string
    type: string
    score: number
    breakdown: {
      vectorScore: number
      graphScore: number
      recencyScore: number
      explicitScore: number
    }
    metadata?: Record<string, unknown>
  }>
> {
  const query = input.query.trim()
  const candidates = Array.isArray(input.candidates) ? input.candidates : []
  const limit = Math.max(1, input.limit ?? DEFAULT_LIMIT)
  const weights = normalizeWeights(input.weights)

  if (!query || candidates.length === 0) return []

  const queryTerms = tokenize(query)
  const [queryVector, qdrantVectors, recencyScores] = await Promise.all([
    buildQueryVector(query),
    fetchMissingCandidateVectors(candidates),
    getRecencyScores(candidates),
  ])

  const results = await Promise.all(
    candidates.map(async (candidate) => {
      const candidateVector = candidate.vector || qdrantVectors.get(candidate.id)
      const vectorScore =
        queryVector && candidateVector ? cosineSimilarity(queryVector, candidateVector) : 0
      const graphScore = await computeGraphScore(candidate.id, queryTerms)
      const recencyScore = recencyScores.get(candidate.id) ?? 0
      const explicitScore = explicitKeywordScore(queryTerms, metadataToKeywords(candidate.metadata))
      const score =
        vectorScore * weights.vector +
        graphScore * weights.graph +
        recencyScore * weights.recency +
        explicitScore * weights.explicit

      return {
        id: candidate.id,
        type: candidate.type,
        score: Number(score.toFixed(6)),
        breakdown: {
          vectorScore: Number(vectorScore.toFixed(6)),
          graphScore: Number(graphScore.toFixed(6)),
          recencyScore: Number(recencyScore.toFixed(6)),
          explicitScore: Number(explicitScore.toFixed(6)),
        },
        metadata: candidate.metadata,
      }
    })
  )

  const ranked = results.sort((a, b) => b.score - a.score).slice(0, limit)
  await bumpRecencyScores(ranked)
  return ranked
}
