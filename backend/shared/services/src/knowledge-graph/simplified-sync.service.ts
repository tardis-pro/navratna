import { KnowledgeType, SourceType } from '@uaip/types';
import { KnowledgeItemEntity } from '../entities/knowledge-item.entity.js';
import { KnowledgeRepository } from '../database/repositories/knowledge.repository.js';
import { QdrantService } from '../qdrant.service.js';
import { ToolGraphDatabase } from '../database/toolGraphDatabase.js';
import { SmartEmbeddingService } from './smart-embedding.service.js';
import { KnowledgeClusteringService, KnowledgeCluster } from './knowledge-clustering.service.js';

export interface SimplifiedSyncResult {
  totalFromNeo4j: number;
  totalToQdrant: number;
  totalClustered: number;
  totalToPostgres: number;
  clustersCreated: number;
  reductionRatio: number;
  errors: string[];
  syncTimestamp: Date;
}

export interface Neo4jKnowledgeItem {
  id: string;
  content: string;
  type: string;
  tags: string[];
  confidence: number;
  sourceType: string;
  metadata: Record<string, any>;
}

/**
 * Simplified Unidirectional Sync Service
 * Flow: Neo4j → Qdrant (with clustering) → PostgreSQL
 */
export class SimplifiedSyncService {
  private readonly batchSize = 100;
  private clusteringService: KnowledgeClusteringService;

  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly qdrantService: QdrantService,
    private readonly graphDb: ToolGraphDatabase,
    private readonly embeddingService: SmartEmbeddingService
  ) {
    this.clusteringService = new KnowledgeClusteringService(qdrantService, embeddingService);
  }

  /**
   * Main sync method - runs the complete pipeline
   */
  async runSimplifiedSync(): Promise<SimplifiedSyncResult> {
    const syncTimestamp = new Date();
    const errors: string[] = [];
    
    try {
      console.log('Starting simplified Neo4j → Qdrant → PostgreSQL sync...');

      // Step 1: Extract all knowledge from Neo4j
      const neo4jItems = await this.extractFromNeo4j();
      console.log(`Extracted ${neo4jItems.length} items from Neo4j`);

      // Step 2: Sync to Qdrant with embeddings
      const qdrantResult = await this.syncToQdrant(neo4jItems);
      console.log(`Synced ${qdrantResult.successful} items to Qdrant`);
      errors.push(...qdrantResult.errors);

      // Step 3: Cluster similar vectors in Qdrant
      const clusteringResult = await this.clusteringService.clusterSimilarKnowledge(20, 0.85);
      console.log(`Created ${clusteringResult.totalClusters} clusters from ${clusteringResult.totalOriginalItems} items`);

      // Step 4: Sync clustered knowledge to PostgreSQL
      const postgresResult = await this.syncToPostgres(clusteringResult.clusters);
      console.log(`Synced ${postgresResult.successful} clustered items to PostgreSQL`);
      errors.push(...postgresResult.errors);

      return {
        totalFromNeo4j: neo4jItems.length,
        totalToQdrant: qdrantResult.successful,
        totalClustered: clusteringResult.totalOriginalItems,
        totalToPostgres: postgresResult.successful,
        clustersCreated: clusteringResult.totalClusters,
        reductionRatio: clusteringResult.reductionRatio,
        errors,
        syncTimestamp
      };

    } catch (error) {
      console.error('Simplified sync failed:', error);
      errors.push(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        totalFromNeo4j: 0,
        totalToQdrant: 0,
        totalClustered: 0,
        totalToPostgres: 0,
        clustersCreated: 0,
        reductionRatio: 0,
        errors,
        syncTimestamp
      };
    }
  }

  /**
   * Step 1: Extract all knowledge items from Neo4j
   */
  async extractFromNeo4j(): Promise<Neo4jKnowledgeItem[]> {
    try {
      const result = await this.graphDb.runQuery(`
        MATCH (n)
        WHERE n.content IS NOT NULL
        RETURN 
          COALESCE(n.id, toString(id(n))) as id,
          n.content as content,
          COALESCE(n.type, labels(n)[0]) as type,
          COALESCE(n.tags, []) as tags,
          COALESCE(n.confidence, 0.8) as confidence,
          COALESCE(n.sourceType, 'neo4j') as sourceType,
          properties(n) as metadata
        LIMIT 10000
      `, {});

      return result.records.map(record => ({
        id: record.get('id'),
        content: record.get('content'),
        type: record.get('type'),
        tags: record.get('tags') || [],
        confidence: record.get('confidence'),
        sourceType: record.get('sourceType'),
        metadata: record.get('metadata') || {}
      }));

    } catch (error) {
      console.error('Error extracting from Neo4j:', error);
      return [];
    }
  }

  /**
   * Step 2: Sync Neo4j items to Qdrant with embeddings
   */
  async syncToQdrant(items: Neo4jKnowledgeItem[]): Promise<{ successful: number; errors: string[] }> {
    const errors: string[] = [];
    let successful = 0;

    // Process in batches
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      
      try {
        // Generate embeddings for batch
        const embeddings = await this.embeddingService.generateBatchEmbeddings(
          batch.map(item => item.content)
        );

        // Prepare Qdrant points in the correct format
        const qdrantDocs = batch.map((item, index) => ({
          id: item.id,
          content: item.content,
          embedding: embeddings[index],
          metadata: {
            knowledgeType: this.mapToKnowledgeType(item.type),
            tags: item.tags,
            confidence: item.confidence,
            sourceType: item.sourceType,
            originalMetadata: item.metadata,
            syncedAt: new Date().toISOString()
          }
        }));

        // Upsert to Qdrant
        await this.qdrantService.upsert(qdrantDocs);
        successful += batch.length;

      } catch (error) {
        const errorMsg = `Batch ${i}-${i + batch.length} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return { successful, errors };
  }

  /**
   * Step 3: Sync clustered knowledge to PostgreSQL
   */
  async syncToPostgres(clusters: KnowledgeCluster[]): Promise<{ successful: number; errors: string[] }> {
    const errors: string[] = [];
    let successful = 0;

    for (const cluster of clusters) {
      try {
        // Convert cluster to KnowledgeItemEntity
        const knowledgeItem = await this.clusteringService.consolidateCluster(cluster);
        
        // Convert to ingest format
        const ingestData = {
          content: knowledgeItem.content,
          type: knowledgeItem.type,
          tags: knowledgeItem.tags,
          source: {
            type: knowledgeItem.sourceType,
            identifier: knowledgeItem.sourceIdentifier,
            metadata: knowledgeItem.metadata
          },
          confidence: knowledgeItem.confidence,
          userId: knowledgeItem.userId,
          agentId: knowledgeItem.agentId,
          summary: knowledgeItem.summary
        };
        
        // Save to PostgreSQL using the correct method
        await this.knowledgeRepository.create(ingestData);
        successful++;

      } catch (error) {
        const errorMsg = `Cluster ${cluster.clusterId} sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return { successful, errors };
  }

  /**
   * Get sync statistics
   */
  async getSyncStatistics(): Promise<{
    neo4jItems: number;
    qdrantItems: number;
    postgresItems: number;
    lastSync: Date | null;
  }> {
    try {
      // Count Neo4j items
      const neo4jResult = await this.graphDb.runQuery(`
        MATCH (n)
        WHERE n.content IS NOT NULL
        RETURN count(n) as count
      `, {});
      const neo4jItems = neo4jResult.records[0]?.get('count')?.toNumber() || 0;

      // Count Qdrant items
      const qdrantInfo = await this.qdrantService.getCollectionInfo();
      const qdrantItems = qdrantInfo.result?.points_count || 0;

      // Count PostgreSQL items
      const allItems = await this.knowledgeRepository.findAll();
      const postgresItems = allItems.length;

      // Get last sync timestamp (from most recent item metadata)
      const clusteredItems = allItems.filter(item => item.sourceType === SourceType.CLUSTERED);
      const sortedItems = clusteredItems.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const lastSync = sortedItems.length > 0 ? sortedItems[0].createdAt : null;

      return {
        neo4jItems,
        qdrantItems,
        postgresItems,
        lastSync
      };

    } catch (error) {
      console.error('Error getting sync statistics:', error);
      return {
        neo4jItems: 0,
        qdrantItems: 0,
        postgresItems: 0,
        lastSync: null
      };
    }
  }

  /**
   * Clear all synced data (useful for re-sync)
   */
  async clearSyncedData(): Promise<void> {
    try {
      // Clear Qdrant collection
      await this.qdrantService.deleteCollection();
      await this.qdrantService.ensureCollection();

      // Clear PostgreSQL clustered items
      const allItems = await this.knowledgeRepository.findAll();
      const clusteredItems = allItems.filter(item => item.sourceType === SourceType.CLUSTERED);
      for (const item of clusteredItems) {
        await this.knowledgeRepository.delete(item.id);
      }

      console.log('Cleared all synced data');
    } catch (error) {
      console.error('Error clearing synced data:', error);
      throw error;
    }
  }

  /**
   * Map Neo4j node types to valid KnowledgeType enum values
   */
  private mapToKnowledgeType(type: string): KnowledgeType {
    const typeMapping: Record<string, KnowledgeType> = {
      // Business & Organizations
      'Company': KnowledgeType.FACTUAL,
      'Organization': KnowledgeType.FACTUAL,
      'BusinessUnit': KnowledgeType.FACTUAL,
      'Department': KnowledgeType.FACTUAL,
      
      // People & Roles
      'Person': KnowledgeType.FACTUAL,
      'Employee': KnowledgeType.FACTUAL,
      'Manager': KnowledgeType.FACTUAL,
      'Developer': KnowledgeType.FACTUAL,
      'Designer': KnowledgeType.FACTUAL,
      'Engineer': KnowledgeType.FACTUAL,
      
      // Opportunities & Business
      'Opportunity': KnowledgeType.EXPERIENTIAL,
      'Lead': KnowledgeType.EXPERIENTIAL,
      'Deal': KnowledgeType.EXPERIENTIAL,
      'Sale': KnowledgeType.EXPERIENTIAL,
      'Campaign': KnowledgeType.EXPERIENTIAL,
      
      // Projects & Work
      'Project': KnowledgeType.PROCEDURAL,
      'Task': KnowledgeType.PROCEDURAL,
      'Sprint': KnowledgeType.PROCEDURAL,
      'Epic': KnowledgeType.PROCEDURAL,
      'Feature': KnowledgeType.PROCEDURAL,
      'Bug': KnowledgeType.PROCEDURAL,
      
      // Knowledge & Content
      'Document': KnowledgeType.SEMANTIC,
      'Article': KnowledgeType.SEMANTIC,
      'Report': KnowledgeType.SEMANTIC,
      'Wiki': KnowledgeType.SEMANTIC,
      'Blog': KnowledgeType.SEMANTIC,
      'Note': KnowledgeType.SEMANTIC,
      
      // Technical
      'API': KnowledgeType.PROCEDURAL,
      'Service': KnowledgeType.PROCEDURAL,
      'Database': KnowledgeType.FACTUAL,
      'Server': KnowledgeType.FACTUAL,
      'Application': KnowledgeType.FACTUAL,
      'Code': KnowledgeType.PROCEDURAL,
      
      // Events & Activities
      'Meeting': KnowledgeType.EPISODIC,
      'Event': KnowledgeType.EPISODIC,
      'Conference': KnowledgeType.EPISODIC,
      'Workshop': KnowledgeType.EPISODIC,
      'Training': KnowledgeType.EPISODIC,
      
      // Concepts & Ideas
      'Concept': KnowledgeType.CONCEPTUAL,
      'Idea': KnowledgeType.CONCEPTUAL,
      'Strategy': KnowledgeType.CONCEPTUAL,
      'Goal': KnowledgeType.CONCEPTUAL,
      'Objective': KnowledgeType.CONCEPTUAL,
      
      // Default mappings
      'FACTUAL': KnowledgeType.FACTUAL,
      'PROCEDURAL': KnowledgeType.PROCEDURAL,
      'CONCEPTUAL': KnowledgeType.CONCEPTUAL,
      'EXPERIENTIAL': KnowledgeType.EXPERIENTIAL,
      'EPISODIC': KnowledgeType.EPISODIC,
      'SEMANTIC': KnowledgeType.SEMANTIC
    };

    return typeMapping[type] || KnowledgeType.FACTUAL;
  }
}