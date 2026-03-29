import { logger } from '@uaip/utils'
import { SourceType } from '@uaip/types'
import type {
  Constellation,
  ConstellationItem,
  ConstellationHealth,
  ConstellationMetadata,
  ConstellationRequest,
  ConstellationResponse,
  KnowledgeCluster,
  QdrantPoint,
  ClusteringResult,
} from '@uaip/types'
import { ServiceFactory } from './service_factory'
import { QdrantService } from './qdrant_service'
import { SmartEmbeddingService } from './knowledge-graph/smart_embedding_service'
import { KnowledgeClusteringService } from './knowledge-graph/knowledge_clustering_service'
import { scoreRelevance } from './relevance_service'

const DEFAULT_MIN_CLUSTER_SIZE = 2
const DEFAULT_SIMILARITY_THRESHOLD = 0.6
const DEFAULT_LIMIT = 20

let qdrantService: QdrantService | null = null
let embeddingService: SmartEmbeddingService | null = null
let clusteringService: KnowledgeClusteringService | null = null

async function getQdrantService(): Promise<QdrantService> {
  if (!qdrantService) {
    qdrantService = await ServiceFactory.getInstance().getQdrantService()
  }
  return qdrantService
}

async function getEmbeddingService(): Promise<SmartEmbeddingService> {
  if (!embeddingService) {
    embeddingService = await ServiceFactory.getInstance().getSmartEmbeddingService()
  }
  return embeddingService
}

async function getClusteringService(): Promise<KnowledgeClusteringService> {
  if (!clusteringService) {
    clusteringService = new KnowledgeClusteringService(
      await getQdrantService(),
      await getEmbeddingService()
    )
  }
  return clusteringService
}

function generateConstellationName(cluster: KnowledgeCluster): string {
  const tags = cluster.consolidatedTags
  if (tags.length === 0) return `${cluster.consolidatedType} Cluster`
  return tags.slice(0, 3).map((tag) => tag.charAt(0).toUpperCase() + tag.slice(1)).join(' / ')
}

function generateDescription(cluster: KnowledgeCluster): string {
  const itemCount = cluster.similarChunks.length
  return `A constellation of ${itemCount} ${cluster.consolidatedType.toLowerCase()} knowledge items with ${Math.round(cluster.averageConfidence * 100)}% average confidence.`
}

function determineDominantSourceType(cluster: KnowledgeCluster): SourceType {
  const sourceCounts = new Map<string, number>()
  for (const source of cluster.sources) {
    sourceCounts.set(source.sourceType, (sourceCounts.get(source.sourceType) || 0) + 1)
  }

  let dominant = SourceType.CLUSTERED
  let maxCount = 0
  for (const [sourceType, count] of sourceCounts) {
    if (count > maxCount) {
      maxCount = count
      const enumValue = Object.values(SourceType).find((value) => value === sourceType)
      dominant = enumValue ?? SourceType.CLUSTERED
    }
  }

  return dominant
}

function determineHealth(cluster: KnowledgeCluster): ConstellationHealth {
  const confidence = cluster.averageConfidence
  const chunkCount = cluster.similarChunks.length
  if (confidence >= 0.9) return 'validated'
  if (confidence >= 0.75) return 'stable'
  if (confidence >= 0.5 && chunkCount > 5) return 'active'
  if (confidence >= 0.5) return 'processing'
  if (confidence >= 0.3) return 'ambiguous'
  return 'conflicted'
}

function mapPointToItem(point: QdrantPoint, itemRelevance: number): ConstellationItem {
  const now = new Date().toISOString()
  const sourceEnum =
    Object.values(SourceType).find((value) => value === point.payload.sourceType) ??
    SourceType.CLUSTERED

  return {
    id: point.id,
    title: point.payload.content.slice(0, 80).replace(/\n/g, ' '),
    content: point.payload.content,
    knowledgeType: point.payload.knowledgeType,
    sourceType: sourceEnum,
    confidence: point.payload.confidence,
    tags: point.payload.tags,
    relevanceScore: itemRelevance,
    createdAt: now,
    updatedAt: now,
  }
}

function mapClusterToConstellation(cluster: KnowledgeCluster, relevanceScore: number): Constellation {
  const items = cluster.similarChunks.map((point) => mapPointToItem(point, relevanceScore))
  const metadata: ConstellationMetadata = {
    itemCount: items.length,
    averageConfidence: cluster.averageConfidence,
    dominantSourceType: determineDominantSourceType(cluster),
    lastUpdated: new Date().toISOString(),
    clusterSimilarity: cluster.confidence,
  }

  return {
    id: cluster.clusterId,
    name: generateConstellationName(cluster),
    description: generateDescription(cluster),
    knowledgeType: cluster.consolidatedType,
    items,
    relevanceScore,
    confidence: cluster.averageConfidence,
    tags: cluster.consolidatedTags,
    health: determineHealth(cluster),
    metadata,
  }
}

async function scoreConstellations(constellations: Constellation[], query: string): Promise<Constellation[]> {
  if (!query || constellations.length === 0) return constellations

  try {
    const results = await scoreRelevance({
      query,
      candidates: constellations.map((constellation) => ({
        id: constellation.id,
        type: 'knowledge',
        metadata: {
          name: constellation.name,
          description: constellation.description,
          tags: constellation.tags,
          knowledgeType: constellation.knowledgeType,
        },
      })),
      weights: {
        vector: 0.5,
        graph: 0.2,
        recency: 0.1,
        explicit: 0.2,
      },
      limit: constellations.length,
    })

    const scoreMap = new Map(results.map((result) => [result.id, result.score]))
    return constellations
      .map((constellation) => ({
        ...constellation,
        relevanceScore: scoreMap.get(constellation.id) ?? constellation.relevanceScore,
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
  } catch (error) {
    logger.warn('Relevance scoring failed for constellations, using default ordering', {
      error: error instanceof Error ? error.message : String(error),
    })
    return constellations
  }
}

export async function getConstellations(
  request: ConstellationRequest
): Promise<ConstellationResponse> {
  const limit = request.limit ?? DEFAULT_LIMIT
  const minSimilarity = request.minSimilarity ?? DEFAULT_SIMILARITY_THRESHOLD
  const query = request.query ?? ''

  logger.info('Building constellations', { query, limit, minSimilarity })

  let clusteringResult: ClusteringResult
  try {
    clusteringResult = await (await getClusteringService()).clusterSimilarKnowledge(
      DEFAULT_MIN_CLUSTER_SIZE,
      minSimilarity
    )
  } catch (error) {
    logger.error('Clustering failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      constellations: [],
      totalItems: 0,
      query,
      clusteredAt: new Date().toISOString(),
    }
  }

  let constellations = clusteringResult.clusters.map((cluster) =>
    mapClusterToConstellation(cluster, cluster.averageConfidence)
  )

  if (query) {
    constellations = await scoreConstellations(constellations, query)
  }

  const limitedConstellations = constellations.slice(0, limit).map((constellation) =>
    request.includeItems === false
      ? { ...constellation, items: [] }
      : constellation
  )

  logger.info('Constellations built', {
    constellationCount: limitedConstellations.length,
    totalItems: clusteringResult.totalOriginalItems,
  })

  return {
    constellations: limitedConstellations,
    totalItems: clusteringResult.totalOriginalItems,
    query,
    clusteredAt: new Date().toISOString(),
  }
}
