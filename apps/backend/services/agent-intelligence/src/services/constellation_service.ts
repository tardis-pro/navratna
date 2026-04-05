import { logger } from '@uaip/utils';
import { SourceType } from '@uaip/types';
import type {
  Constellation,
  ConstellationItem,
  ConstellationHealth,
  ConstellationMetadata,
  ConstellationRequest,
  ConstellationResponse,
} from '@uaip/types';
import {
  KnowledgeClusteringService,
  type KnowledgeCluster,
  type QdrantPoint,
  type ClusteringResult,
} from '../knowledge-graph/knowledge_clustering_service.js';
import { QdrantService } from '../knowledge-graph/qdrant_service.js';
import { SmartEmbeddingService } from '../knowledge-graph/smart_embedding_service.js';
import { relevance, type RelevanceInput, type RelevanceResult } from './relevance.js';

// ─── Constants ──────────────────────────────────────────────────────────
const DEFAULT_MIN_CLUSTER_SIZE = 2;
const DEFAULT_SIMILARITY_THRESHOLD = 0.6;
const DEFAULT_LIMIT = 20;

// ─── Service ────────────────────────────────────────────────────────────

let qdrantService: QdrantService | null = null;
let embeddingService: SmartEmbeddingService | null = null;
let clusteringService: KnowledgeClusteringService | null = null;

function getQdrantService(): QdrantService {
  if (!qdrantService) {
    qdrantService = new QdrantService(process.env.QDRANT_URL || 'http://localhost:6333');
  }
  return qdrantService;
}

function getEmbeddingService(): SmartEmbeddingService {
  if (!embeddingService) {
    embeddingService = new SmartEmbeddingService();
  }
  return embeddingService;
}

function getClusteringService(): KnowledgeClusteringService {
  if (!clusteringService) {
    clusteringService = new KnowledgeClusteringService(getQdrantService(), getEmbeddingService());
  }
  return clusteringService;
}

// ─── Mapping helpers ────────────────────────────────────────────────────

function generateConstellationName(cluster: KnowledgeCluster): string {
  const tags = cluster.consolidatedTags;
  if (tags.length === 0) {
    return `${cluster.consolidatedType} Cluster`;
  }
  // Use the top 3 dominant tags for the name
  const dominantTags = tags.slice(0, 3);
  return dominantTags.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' / ');
}

function generateDescription(cluster: KnowledgeCluster): string {
  const itemCount = cluster.similarChunks.length;
  const typeName = cluster.consolidatedType;
  return `A constellation of ${itemCount} ${typeName.toLowerCase()} knowledge items with ${Math.round(cluster.averageConfidence * 100)}% average confidence.`;
}

function determineDominantSourceType(cluster: KnowledgeCluster): SourceType {
  const sourceCounts = new Map<string, number>();

  for (const source of cluster.sources) {
    const key = source.sourceType;
    sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
  }

  let dominant = SourceType.CLUSTERED;
  let maxCount = 0;

  for (const [sourceType, count] of sourceCounts) {
    if (count > maxCount) {
      maxCount = count;
      // Map string back to enum value; fall back to CLUSTERED if not found
      const enumValue = Object.values(SourceType).find((v) => v === sourceType);
      dominant = enumValue ?? SourceType.CLUSTERED;
    }
  }

  return dominant;
}

function determineHealth(cluster: KnowledgeCluster): ConstellationHealth {
  const confidence = cluster.averageConfidence;
  const chunkCount = cluster.similarChunks.length;

  if (confidence >= 0.9) return 'validated';
  if (confidence >= 0.75) return 'stable';
  if (confidence >= 0.5 && chunkCount > 5) return 'active';
  if (confidence >= 0.5) return 'processing';
  if (confidence >= 0.3) return 'ambiguous';
  return 'conflicted';
}

function mapPointToItem(point: QdrantPoint, itemRelevance: number): ConstellationItem {
  const now = new Date().toISOString();
  const sourceTypeRaw = point.payload.sourceType;
  const sourceEnum =
    Object.values(SourceType).find((v) => v === sourceTypeRaw) ?? SourceType.CLUSTERED;

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
  };
}

function mapClusterToConstellation(
  cluster: KnowledgeCluster,
  relevanceScore: number
): Constellation {
  const items: ConstellationItem[] = cluster.similarChunks.map((point) =>
    mapPointToItem(point, relevanceScore)
  );

  const metadata: ConstellationMetadata = {
    itemCount: items.length,
    averageConfidence: cluster.averageConfidence,
    dominantSourceType: determineDominantSourceType(cluster),
    lastUpdated: new Date().toISOString(),
    clusterSimilarity: cluster.confidence,
  };

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
  };
}

// ─── Score constellations via relevance engine ──────────────────────────

async function scoreConstellations(
  constellations: Constellation[],
  query: string
): Promise<Constellation[]> {
  if (!query || constellations.length === 0) {
    return constellations;
  }

  const candidates: RelevanceInput['candidates'] = constellations.map((c) => ({
    id: c.id,
    type: 'knowledge' as const,
    metadata: {
      name: c.name,
      description: c.description,
      tags: c.tags,
      knowledgeType: c.knowledgeType,
    },
  }));

  const input: RelevanceInput = {
    query,
    candidates,
    weights: {
      vector: 0.5,
      graph: 0.2,
      recency: 0.1,
      explicit: 0.2,
    },
    limit: constellations.length,
  };

  let results: RelevanceResult[];
  try {
    results = await relevance(input);
  } catch (error) {
    logger.warn('Relevance scoring failed for constellations, using default ordering', {
      error: error instanceof Error ? error.message : String(error),
    });
    return constellations;
  }

  const scoreMap = new Map<string, number>();
  for (const r of results) {
    scoreMap.set(r.id, r.score);
  }

  return constellations
    .map((c) => ({
      ...c,
      relevanceScore: scoreMap.get(c.id) ?? c.relevanceScore,
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// ─── Public API ─────────────────────────────────────────────────────────

export async function getConstellations(
  request: ConstellationRequest
): Promise<ConstellationResponse> {
  const limit = request.limit ?? DEFAULT_LIMIT;
  const minSimilarity = request.minSimilarity ?? DEFAULT_SIMILARITY_THRESHOLD;
  const query = request.query ?? '';

  logger.info('Building constellations', { query, limit, minSimilarity });

  let clusteringResult: ClusteringResult;
  try {
    clusteringResult = await getClusteringService().clusterSimilarKnowledge(
      DEFAULT_MIN_CLUSTER_SIZE,
      minSimilarity
    );
  } catch (error) {
    logger.error('Clustering failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      constellations: [],
      totalItems: 0,
      query,
      clusteredAt: new Date().toISOString(),
    };
  }

  // Map clusters to constellations (initial relevance = confidence)
  let constellations: Constellation[] = clusteringResult.clusters.map((cluster) =>
    mapClusterToConstellation(cluster, cluster.averageConfidence)
  );

  // Score via relevance engine when a query is provided
  if (query) {
    constellations = await scoreConstellations(constellations, query);
  }

  // Apply limit
  constellations = constellations.slice(0, limit);

  // Strip items if not requested
  if (request.includeItems === false) {
    constellations = constellations.map((c) => ({ ...c, items: new Array<ConstellationItem>() }));
  }

  const totalItems = clusteringResult.totalOriginalItems;

  logger.info('Constellations built', {
    constellationCount: constellations.length,
    totalItems,
  });

  return {
    constellations,
    totalItems,
    query,
    clusteredAt: new Date().toISOString(),
  };
}
