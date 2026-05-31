import { QdrantService } from './qdrant_service.js';
import { KnowledgeItemEntity } from '@uaip/shared-services';
import { KnowledgeType, SourceType } from '@uaip/types';
import { SmartEmbeddingService } from './smart_embedding_service.js';
import { logger, NotFoundError } from '@uaip/utils';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isKnowledgeType(v: unknown): v is KnowledgeType {
  return typeof v === 'string' && new Set<string>(Object.values(KnowledgeType)).has(v);
}

export interface KnowledgeCluster {
  clusterId: string;
  primaryVector: QdrantPoint;
  similarChunks: QdrantPoint[];
  consolidatedContent: string;
  confidence: number;
  sources: SourceMetadata[];
  consolidatedType: KnowledgeType;
  consolidatedTags: string[];
  averageConfidence: number;
}

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: {
    content: string;
    knowledgeType: KnowledgeType;
    tags: string[];
    confidence: number;
    sourceType: string;
    originalMetadata: Record<string, unknown>;
  };
}

export interface SourceMetadata {
  id: string;
  sourceType: string;
  confidence: number;
  originalMetadata: Record<string, unknown>;
}

export interface ClusteringResult {
  totalClusters: number;
  totalOriginalItems: number;
  totalConsolidatedItems: number;
  reductionRatio: number;
  averageClusterSize: number;
  clusters: KnowledgeCluster[];
}

export class KnowledgeClusteringService {
  private readonly minClusterSize = parseInt(
    process.env.KNOWLEDGE_CLUSTER_MIN_SIZE ?? '3',
    10
  );
  private readonly similarityThreshold = parseFloat(
    process.env.KNOWLEDGE_CLUSTER_SIMILARITY_THRESHOLD ?? '0.65'
  );
  private readonly maxClusterSize = 100;

  constructor(
    private readonly qdrantService: QdrantService,
    private readonly embeddingService: SmartEmbeddingService
  ) {}

  /**
   * Main clustering method - groups similar knowledge chunks
   */
  async clusterSimilarKnowledge(
    minClusterSize: number = this.minClusterSize,
    similarityThreshold: number = this.similarityThreshold,
    tenantId: string = 'system'
  ): Promise<ClusteringResult> {
    // 1. Get all vectors from Qdrant
    const allPoints = await this.getAllQdrantPoints(tenantId);

    if (allPoints.length < minClusterSize) {
      return {
        totalClusters: 0,
        totalOriginalItems: allPoints.length,
        totalConsolidatedItems: 0,
        reductionRatio: 0,
        averageClusterSize: 0,
        clusters: [],
      };
    }

    // 2. Find clusters using similarity-based grouping
    const clusters = await this.findSimilarityClusters(
      allPoints,
      minClusterSize,
      similarityThreshold
    );

    // 3. Consolidate each cluster
    const consolidatedClusters = await this.consolidateAllClusters(clusters);

    // 4. Calculate metrics
    const totalConsolidatedItems = consolidatedClusters.length;
    const reductionRatio =
      allPoints.length > 0 ? (allPoints.length - totalConsolidatedItems) / allPoints.length : 0;
    const averageClusterSize =
      clusters.length > 0
        ? clusters.reduce((sum, cluster) => sum + cluster.length, 0) / clusters.length
        : 0;

    return {
      totalClusters: clusters.length,
      totalOriginalItems: allPoints.length,
      totalConsolidatedItems,
      reductionRatio,
      averageClusterSize,
      clusters: consolidatedClusters,
    };
  }

  /**
   * Find similar vectors for a given vector ID
   */
  async findSimilarChunks(
    vectorId: string,
    threshold: number = this.similarityThreshold
  ): Promise<QdrantPoint[]> {
    try {
      // Get the reference vector using the correct API
      const referencePoints = await this.qdrantService.getPoints([vectorId]);
      if (!referencePoints || referencePoints.length === 0) {
        throw new NotFoundError(`Vector ${vectorId} not found`);
      }

      const referencePoint = referencePoints[0];

      // Search for similar vectors
      const searchResults = await this.qdrantService.search(referencePoint.vector, {
        limit: 50,
        threshold: threshold,
      });

      return searchResults.map((result) => {
        const rawPayload = result.payload;
        const knowledgeTypeRaw = rawPayload.knowledgeType;
        const knowledgeType: KnowledgeType = isKnowledgeType(knowledgeTypeRaw) ? knowledgeTypeRaw : KnowledgeType.FACTUAL;
        const originalMeta = rawPayload.originalMetadata;
        return {
          id: result.id.toString(),
          vector: new Array<number>(),
          payload: {
            content: String(rawPayload.content ?? ''),
            knowledgeType,
            tags: Array.isArray(rawPayload.tags) ? rawPayload.tags.filter((x): x is string => typeof x === 'string') : [],
            confidence: typeof rawPayload.confidence === 'number' ? rawPayload.confidence : 0,
            sourceType: String(rawPayload.sourceType ?? ''),
            originalMetadata: isRecord(originalMeta) ? originalMeta : {},
          },
        };
      });
    } catch (error) {
      logger.error('Error finding similar chunks', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  /**
   * Consolidate a cluster into a single knowledge item
   */
  async consolidateCluster(cluster: KnowledgeCluster): Promise<KnowledgeItemEntity> {
    // Create consolidated content
    const consolidatedContent = this.mergeContent(cluster.similarChunks);

    // Determine the most common type
    const consolidatedType = this.getMostCommonType(cluster.similarChunks);

    // Merge all tags
    const consolidatedTags = this.mergeTags(cluster.similarChunks);

    // Calculate average confidence
    const averageConfidence = this.calculateAverageConfidence(cluster.similarChunks);

    // Create knowledge item entity as plain object
    const knowledgeItem: KnowledgeItemEntity = {
      id: '', // Will be assigned by database
      createdAt: new Date(),
      updatedAt: new Date(),
      content: consolidatedContent,
      type: consolidatedType,
      tags: consolidatedTags,
      confidence: averageConfidence,
      sourceType: SourceType.CLUSTERED,
      sourceIdentifier: `cluster_${cluster.clusterId}`,
      sourceUrl: null,
      createdBy: null,
      organizationId: null,
      userId: null,
      agentId: null,
      summary: null,
      metadata: {
        clusterId: cluster.clusterId,
        originalItemsCount: cluster.similarChunks.length,
        consolidatedAt: new Date().toISOString(),
        sources: cluster.sources,
      },
      accessLevel: 'public',
    };

    return knowledgeItem;
  }

  /**
   * Get all points from Qdrant collection
   */
  private async getAllQdrantPoints(tenantId: string): Promise<QdrantPoint[]> {
    try {
      const rawPoints = await this.qdrantService.scrollAllQdrantPoints(tenantId, 10000);
      return rawPoints.map((point) => {
        const knowledgeTypeRaw = point.payload.knowledgeType;
        const knowledgeType: KnowledgeType = isKnowledgeType(knowledgeTypeRaw) ? knowledgeTypeRaw : KnowledgeType.FACTUAL;
        const originalMeta = point.payload.originalMetadata;
        return {
          id: point.id,
          vector: point.vector,
          payload: {
            content: String(point.payload.content ?? ''),
            knowledgeType,
            tags: Array.isArray(point.payload.tags) ? point.payload.tags.filter((x): x is string => typeof x === 'string') : [],
            confidence: typeof point.payload.confidence === 'number' ? point.payload.confidence : 0,
            sourceType: String(point.payload.sourceType ?? ''),
            originalMetadata: isRecord(originalMeta) ? originalMeta : {},
          },
        };
      });
    } catch (error) {
      logger.error('Error getting Qdrant points', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  /**
   * Find clusters using similarity-based grouping
   */
  private async findSimilarityClusters(
    points: QdrantPoint[],
    minClusterSize: number,
    threshold: number
  ): Promise<QdrantPoint[][]> {
    const clusters: QdrantPoint[][] = [];
    const processedIds = new Set<string>();

    for (const point of points) {
      if (processedIds.has(point.id)) continue;

      // Find similar points
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const similarPoints = await this.findSimilarPoints(point, points, threshold);

      // Only create cluster if it meets minimum size
      if (similarPoints.length >= minClusterSize) {
        clusters.push(similarPoints);

        // Mark all points in this cluster as processed
        similarPoints.forEach((p) => processedIds.add(p.id));
      }
    }

    return clusters;
  }

  /**
   * Find similar points to a reference point
   */
  private async findSimilarPoints(
    referencePoint: QdrantPoint,
    allPoints: QdrantPoint[],
    threshold: number
  ): Promise<QdrantPoint[]> {
    const similarPoints: QdrantPoint[] = [referencePoint];

    for (const point of allPoints) {
      if (point.id === referencePoint.id) continue;

      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const similarity = await this.calculateCosineSimilarity(referencePoint.vector, point.vector);

      if (similarity >= threshold) {
        similarPoints.push(point);
      }
    }

    return similarPoints;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private async calculateCosineSimilarity(vector1: number[], vector2: number[]): Promise<number> {
    if (vector1.length !== vector2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      norm1 += vector1[i] * vector1[i];
      norm2 += vector2[i] * vector2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Consolidate all clusters
   */
  private async consolidateAllClusters(clusters: QdrantPoint[][]): Promise<KnowledgeCluster[]> {
    const consolidatedClusters: KnowledgeCluster[] = [];

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const clusterId = `cluster_${Date.now()}_${i}`;

      // Find the most representative point (highest confidence)
      const primaryVector = cluster.reduce((best, current) =>
        current.payload.confidence > best.payload.confidence ? current : best
      );

      // Create consolidated content
      const consolidatedContent = this.mergeContent(cluster);

      // Extract source metadata
      const sources: SourceMetadata[] = cluster.map((point) => ({
        id: point.id,
        sourceType: point.payload.sourceType,
        confidence: point.payload.confidence,
        originalMetadata: point.payload.originalMetadata,
      }));

      const consolidatedCluster: KnowledgeCluster = {
        clusterId,
        primaryVector,
        similarChunks: cluster,
        consolidatedContent,
        confidence: this.calculateAverageConfidence(cluster),
        sources,
        consolidatedType: this.getMostCommonType(cluster),
        consolidatedTags: this.mergeTags(cluster),
        averageConfidence: this.calculateAverageConfidence(cluster),
      };

      consolidatedClusters.push(consolidatedCluster);
    }

    return consolidatedClusters;
  }

  /**
   * Merge content from multiple chunks
   */
  private mergeContent(chunks: QdrantPoint[]): string {
    // Sort by confidence (highest first)
    const sortedChunks = chunks.sort((a, b) => b.payload.confidence - a.payload.confidence);

    // Take the most confident content as primary
    const primaryContent = sortedChunks[0].payload.content;

    // Add additional context from other chunks if they provide new information
    const additionalContext = sortedChunks
      .slice(1, 5) // Take top 5 additional chunks
      .filter((chunk) => !this.isContentSimilar(primaryContent, chunk.payload.content))
      .map((chunk) => chunk.payload.content)
      .join('\n\n');

    return additionalContext ? `${primaryContent}\n\n${additionalContext}` : primaryContent;
  }

  /**
   * Check if two content strings are similar
   */
  private isContentSimilar(content1: string, content2: string): boolean {
    // Simple similarity check - can be enhanced with more sophisticated NLP
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((word) => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size > 0.7; // 70% overlap
  }

  /**
   * Get the most common knowledge type from chunks
   */
  private getMostCommonType(chunks: QdrantPoint[]): KnowledgeType {
    const typeCounts = new Map<KnowledgeType, number>();

    chunks.forEach((chunk) => {
      const type = chunk.payload.knowledgeType;
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    });

    let mostCommonType = KnowledgeType.FACTUAL;
    let maxCount = 0;

    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonType = type;
      }
    }

    return mostCommonType;
  }

  /**
   * Merge tags from multiple chunks
   */
  private mergeTags(chunks: QdrantPoint[]): string[] {
    const tagSet = new Set<string>();

    chunks.forEach((chunk) => {
      chunk.payload.tags.forEach((tag) => tagSet.add(tag));
    });

    return Array.from(tagSet);
  }

  /**
   * Calculate average confidence from chunks
   */
  private calculateAverageConfidence(chunks: QdrantPoint[]): number {
    if (chunks.length === 0) return 0;

    const totalConfidence = chunks.reduce((sum, chunk) => sum + chunk.payload.confidence, 0);
    return totalConfidence / chunks.length;
  }
}
