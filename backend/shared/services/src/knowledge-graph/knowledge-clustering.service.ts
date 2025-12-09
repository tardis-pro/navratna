import { QdrantService } from '../qdrant.service.js';
import { KnowledgeItemEntity } from '../entities/knowledge-item.entity.js';
import { KnowledgeType, SourceType } from '@uaip/types';
import { SmartEmbeddingService } from './smart-embedding.service.js';

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
    originalMetadata: Record<string, any>;
  };
}

export interface SourceMetadata {
  id: string;
  sourceType: string;
  confidence: number;
  originalMetadata: Record<string, any>;
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
  private readonly minClusterSize = 20;
  private readonly similarityThreshold = 0.85;
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
    similarityThreshold: number = this.similarityThreshold
  ): Promise<ClusteringResult> {
    console.log('Starting knowledge clustering process...');

    // 1. Get all vectors from Qdrant
    const allPoints = await this.getAllQdrantPoints();
    console.log(`Found ${allPoints.length} vectors in Qdrant`);

    if (allPoints.length < minClusterSize) {
      console.log('Not enough vectors for clustering');
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
    console.log(`Created ${clusters.length} clusters`);

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
        throw new Error(`Vector ${vectorId} not found`);
      }

      const referencePoint = referencePoints[0];

      // Search for similar vectors
      const searchResults = await this.qdrantService.search(referencePoint.vector, {
        limit: 50,
        threshold: threshold,
      });

      return searchResults.map((result) => ({
        id: result.id.toString(),
        vector: [] as number[], // Search results don't include vectors by default
        payload: result.payload as any,
      }));
    } catch (error) {
      console.error('Error finding similar chunks:', error);
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

    // Create knowledge item entity
    const knowledgeItem = new KnowledgeItemEntity();
    knowledgeItem.content = consolidatedContent;
    knowledgeItem.type = consolidatedType;
    knowledgeItem.tags = consolidatedTags;
    knowledgeItem.confidence = averageConfidence;
    knowledgeItem.sourceType = SourceType.CLUSTERED;
    knowledgeItem.sourceIdentifier = `cluster_${cluster.clusterId}`;
    knowledgeItem.metadata = {
      clusterId: cluster.clusterId,
      originalItemsCount: cluster.similarChunks.length,
      consolidatedAt: new Date().toISOString(),
      sources: cluster.sources,
    };

    return knowledgeItem;
  }

  /**
   * Get all points from Qdrant collection
   */
  private async getAllQdrantPoints(): Promise<QdrantPoint[]> {
    try {
      // Use scroll API to get all points
      const workingUrl = await (this.qdrantService as any).ensureConnection();
      const collectionName = (this.qdrantService as any).collectionName;

      const response = await fetch(`${workingUrl}/collections/${collectionName}/points/scroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          limit: 10000,
          with_payload: true,
          with_vector: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Qdrant scroll failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.result.points.map((point: any) => {
        const vector: number[] = Array.isArray(point.vector) ? (point.vector as number[]) : [];

        return {
          id: point.id.toString(),
          vector,
          payload: point.payload as any,
        };
      });
    } catch (error) {
      console.error('Error getting Qdrant points:', error);
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
